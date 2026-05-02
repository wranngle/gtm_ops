defmodule Symphony.Codex.AppServer do
  @moduledoc """
  JSON-RPC 2.0 client for the Codex app-server, spoken over stdio.

  Implements spec section 10:

    * § 10.1 Launch contract — spawns `bash -lc <codex.command>` via
      `Port.open/2` with `cd: workspace`, line-delimited reads, and a
      10 MB max line size to keep buffer pressure bounded.
    * § 10.2 Session startup handshake — sends `initialize`,
      `initialized`, `thread/start`, `turn/start` in order, reading the
      `thread.id` and `turn.id` to compose the canonical
      `<thread_id>-<turn_id>` `session_id`.
    * § 10.3 Streaming turn processing — line-delimited reads, partial
      line buffering until newline arrives, JSON parse on full lines.
      Stderr is logged as diagnostics, never parsed as protocol JSON.
    * § 10.4 Emitted runtime events — `session_started`, `turn_completed`,
      `turn_failed`, `turn_cancelled`, `turn_ended_with_error`,
      `turn_input_required`, `approval_auto_approved`, `tool_call_*`,
      `notification`, `other_message`, `malformed`, `startup_failed`.
    * § 10.5 Approval/tool/user-input policy — high-trust default:
      auto-approves command-execution and file-change approvals, runs
      supported `linear_graphql` tool calls via the executor, returns a
      failure payload for unsupported tools, and treats free-form
      user-input requests as a hard failure.
    * § 10.6 Timeouts and error mapping — surfaces normalized
      categories: `:invalid_workspace_cwd`, `:response_timeout`,
      `:turn_timeout`, `:port_exit`, `:response_error`, `:turn_failed`,
      `:turn_cancelled`, `:turn_input_required`, `:approval_required`,
      `:bash_not_found`, `:codex_not_found`.
    * § 13.5 Token accounting — extracts cumulative thread totals from
      `thread/tokenUsage/updated` payloads (NOT delta from
      `last_token_usage`) and exposes them in the final result map.

  Continuation turns are NOT handled here; the runner adapter
  (`Symphony.AgentRunner.CodexAppServer`) loops over `run_turn/4` on the
  same session.
  """

  require Logger
  alias Symphony.{Codex.DynamicTool, Config, WorkspaceManager}

  @initialize_id 1
  @thread_start_id 2
  @turn_start_id 3
  # 10 MB max line size — § 10.1 recommendation. Erlang `Port` ports
  # buffer up to this many bytes before forcing a `noeol` chunk.
  @port_line_bytes 10 * 1024 * 1024
  @max_stream_log_bytes 1_000
  @non_interactive_tool_input_answer "This is a non-interactive session. Operator input is unavailable."

  @type session :: %{
          port: port(),
          metadata: map(),
          approval_policy: String.t() | map(),
          auto_approve_requests: boolean(),
          thread_sandbox: String.t(),
          turn_sandbox_policy: map(),
          thread_id: String.t(),
          workspace: Path.t(),
          config: Config.t(),
          token_totals: map()
        }

  @type run_result :: %{
          required(:result) => term(),
          required(:session_id) => String.t(),
          required(:thread_id) => String.t(),
          required(:turn_id) => String.t(),
          required(:tokens) => %{
            required(:input) => non_neg_integer(),
            required(:output) => non_neg_integer(),
            required(:total) => non_neg_integer()
          }
        }

  # ============== Top-level convenience ==============

  @doc """
  Convenience wrapper: start session, run a single turn, stop session.

  Most callers should use `Symphony.AgentRunner.CodexAppServer.run/4`,
  which handles continuation-turn loops and lifecycle hooks. This is
  exposed primarily for tests and one-shot CLI use.
  """
  @spec run(Config.t(), Path.t(), String.t(), map(), keyword()) ::
          {:ok, run_result()} | {:error, term()}
  def run(%{} = config, workspace, prompt, issue, opts \\ []) do
    with {:ok, session} <- start_session(config, workspace, opts) do
      try do
        run_turn(session, prompt, issue, opts)
      after
        stop_session(session)
      end
    end
  end

  # ============== Session lifecycle ==============

  @spec start_session(Config.t(), Path.t(), keyword()) :: {:ok, session()} | {:error, term()}
  def start_session(%{} = config, workspace, opts \\ []) do
    with {:ok, expanded_workspace} <- validate_workspace_cwd(config, workspace),
         {:ok, port} <- start_port(config, expanded_workspace) do
      metadata = port_metadata(port)
      session_policies = session_policies(config, expanded_workspace, opts)

      with {:ok, thread_id} <-
             do_start_session(port, expanded_workspace, session_policies, config) do
        {:ok,
         %{
           port: port,
           metadata: metadata,
           approval_policy: session_policies.approval_policy,
           auto_approve_requests: auto_approve?(session_policies.approval_policy),
           thread_sandbox: session_policies.thread_sandbox,
           turn_sandbox_policy: session_policies.turn_sandbox_policy,
           thread_id: thread_id,
           workspace: expanded_workspace,
           config: config,
           token_totals: %{input: 0, output: 0, total: 0}
         }}
      else
        {:error, reason} ->
          stop_port(port)
          {:error, reason}
      end
    end
  end

  @spec run_turn(session(), String.t(), map(), keyword()) ::
          {:ok, run_result()} | {:error, term()}
  def run_turn(
        %{
          port: port,
          metadata: metadata,
          approval_policy: approval_policy,
          auto_approve_requests: auto_approve_requests,
          turn_sandbox_policy: turn_sandbox_policy,
          thread_id: thread_id,
          workspace: workspace,
          config: config,
          token_totals: prior_totals
        } = _session,
        prompt,
        issue,
        opts \\ []
      ) do
    on_message = Keyword.get(opts, :on_message, &default_on_message/1)

    tool_executor =
      Keyword.get(opts, :tool_executor, fn tool, arguments ->
        DynamicTool.execute(tool, arguments, dynamic_tool_opts(config))
      end)

    case start_turn(
           port,
           thread_id,
           prompt,
           issue,
           workspace,
           approval_policy,
           turn_sandbox_policy,
           config
         ) do
      {:ok, turn_id} ->
        session_id = "#{thread_id}-#{turn_id}"
        Logger.info("Codex session started for #{issue_context(issue)} session_id=#{session_id}")

        emit_message(
          on_message,
          :session_started,
          %{
            session_id: session_id,
            thread_id: thread_id,
            turn_id: turn_id
          },
          metadata
        )

        case await_turn_completion(
               port,
               on_message,
               tool_executor,
               auto_approve_requests,
               config,
               prior_totals
             ) do
          {:ok, {result, totals}} ->
            Logger.info(
              "Codex session completed for #{issue_context(issue)} session_id=#{session_id} " <>
                "tokens_in=#{totals.input} tokens_out=#{totals.output} tokens_total=#{totals.total}"
            )

            {:ok,
             %{
               result: result,
               session_id: session_id,
               thread_id: thread_id,
               turn_id: turn_id,
               tokens: totals
             }}

          {:error, reason} ->
            Logger.warning(
              "Codex session ended with error for #{issue_context(issue)} session_id=#{session_id}: #{inspect(reason)}"
            )

            emit_message(
              on_message,
              :turn_ended_with_error,
              %{
                session_id: session_id,
                reason: reason
              },
              metadata
            )

            {:error, reason}
        end

      {:error, reason} ->
        Logger.error("Codex session failed for #{issue_context(issue)}: #{inspect(reason)}")
        emit_message(on_message, :startup_failed, %{reason: reason}, metadata)
        {:error, reason}
    end
  end

  @spec stop_session(session()) :: :ok
  def stop_session(%{port: port}) when is_port(port) do
    stop_port(port)
  end

  # ============== Workspace validation (§ 10.1) ==============

  defp validate_workspace_cwd(config, workspace) when is_binary(workspace) do
    expanded_workspace = Path.expand(workspace)
    expanded_root = Path.expand(Config.workspace_root(config))

    cond do
      expanded_workspace == expanded_root ->
        {:error, {:invalid_workspace_cwd, :workspace_root, expanded_workspace}}

      String.starts_with?(expanded_workspace <> "/", expanded_root <> "/") ->
        {:ok, expanded_workspace}

      true ->
        {:error,
         {:invalid_workspace_cwd, :outside_workspace_root, expanded_workspace, expanded_root}}
    end
  end

  defp validate_workspace_cwd(_config, _workspace),
    do: {:error, {:invalid_workspace_cwd, :not_a_string}}

  # ============== Subprocess startup (§ 10.1) ==============

  defp start_port(config, workspace) do
    case System.find_executable("bash") do
      nil ->
        {:error, :bash_not_found}

      executable ->
        codex_command = Config.codex_command(config)

        port =
          Port.open(
            {:spawn_executable, String.to_charlist(executable)},
            [
              :binary,
              :exit_status,
              :stderr_to_stdout,
              args: [~c"-lc", String.to_charlist(codex_command)],
              cd: String.to_charlist(workspace),
              line: @port_line_bytes
            ]
          )

        {:ok, port}
    end
  end

  defp port_metadata(port) when is_port(port) do
    case :erlang.port_info(port, :os_pid) do
      {:os_pid, os_pid} -> %{codex_app_server_pid: to_string(os_pid)}
      _ -> %{}
    end
  end

  # ============== Handshake (§ 10.2) ==============

  defp do_start_session(port, workspace, session_policies, config) do
    with :ok <- send_initialize(port, config) do
      start_thread(port, workspace, session_policies, config)
    end
  end

  defp send_initialize(port, config) do
    payload = %{
      "method" => "initialize",
      "id" => @initialize_id,
      "params" => %{
        "capabilities" => %{
          "experimentalApi" => true
        },
        "clientInfo" => %{
          "name" => "symphony-orchestrator",
          "title" => "Symphony Orchestrator",
          "version" => "0.1.0"
        }
      }
    }

    send_message(port, payload)

    with {:ok, _} <- await_response(port, @initialize_id, config) do
      send_message(port, %{"method" => "initialized", "params" => %{}})
      :ok
    end
  end

  defp start_thread(
         port,
         workspace,
         %{approval_policy: approval_policy, thread_sandbox: thread_sandbox},
         config
       ) do
    send_message(port, %{
      "method" => "thread/start",
      "id" => @thread_start_id,
      "params" => %{
        "approvalPolicy" => approval_policy,
        "sandbox" => thread_sandbox,
        "cwd" => workspace,
        "dynamicTools" => advertised_tool_specs(config)
      }
    })

    case await_response(port, @thread_start_id, config) do
      {:ok, %{"thread" => thread_payload}} ->
        case thread_payload do
          %{"id" => thread_id} -> {:ok, thread_id}
          _ -> {:error, {:invalid_thread_payload, thread_payload}}
        end

      other ->
        other
    end
  end

  defp start_turn(
         port,
         thread_id,
         prompt,
         issue,
         workspace,
         approval_policy,
         turn_sandbox_policy,
         config
       ) do
    send_message(port, %{
      "method" => "turn/start",
      "id" => @turn_start_id,
      "params" => %{
        "threadId" => thread_id,
        "input" => [
          %{
            "type" => "text",
            "text" => prompt
          }
        ],
        "cwd" => workspace,
        "title" => issue_title(issue),
        "approvalPolicy" => approval_policy,
        "sandboxPolicy" => turn_sandbox_policy
      }
    })

    case await_response(port, @turn_start_id, config) do
      {:ok, %{"turn" => %{"id" => turn_id}}} -> {:ok, turn_id}
      other -> other
    end
  end

  defp issue_title(%{identifier: identifier, title: title})
       when is_binary(identifier) and is_binary(title),
       do: "#{identifier}: #{title}"

  defp issue_title(%{identifier: identifier}) when is_binary(identifier), do: identifier
  defp issue_title(_), do: "(untitled issue)"

  # ============== Streaming receive loop (§ 10.3) ==============

  defp await_turn_completion(
         port,
         on_message,
         tool_executor,
         auto_approve_requests,
         config,
         totals
       ) do
    receive_loop(
      port,
      on_message,
      turn_timeout_ms(config),
      "",
      tool_executor,
      auto_approve_requests,
      config,
      totals
    )
  end

  defp receive_loop(
         port,
         on_message,
         timeout_ms,
         pending_line,
         tool_executor,
         auto_approve_requests,
         config,
         totals
       ) do
    receive do
      {^port, {:data, {:eol, chunk}}} ->
        complete_line = pending_line <> to_string(chunk)

        handle_incoming(
          port,
          on_message,
          complete_line,
          timeout_ms,
          tool_executor,
          auto_approve_requests,
          config,
          totals
        )

      {^port, {:data, {:noeol, chunk}}} ->
        receive_loop(
          port,
          on_message,
          timeout_ms,
          pending_line <> to_string(chunk),
          tool_executor,
          auto_approve_requests,
          config,
          totals
        )

      {^port, {:exit_status, status}} ->
        {:error, {:port_exit, status}}
    after
      timeout_ms ->
        {:error, :turn_timeout}
    end
  end

  defp handle_incoming(
         port,
         on_message,
         data,
         timeout_ms,
         tool_executor,
         auto_approve_requests,
         config,
         totals
       ) do
    payload_string = to_string(data)

    case Jason.decode(payload_string) do
      {:ok, %{"method" => "turn/completed"} = payload} ->
        emit_turn_event(on_message, :turn_completed, payload, payload_string, port, payload)
        {:ok, {:turn_completed, totals}}

      {:ok, %{"method" => "turn/failed", "params" => _} = payload} ->
        emit_turn_event(
          on_message,
          :turn_failed,
          payload,
          payload_string,
          port,
          Map.get(payload, "params")
        )

        {:error, {:turn_failed, Map.get(payload, "params")}}

      {:ok, %{"method" => "turn/cancelled", "params" => _} = payload} ->
        emit_turn_event(
          on_message,
          :turn_cancelled,
          payload,
          payload_string,
          port,
          Map.get(payload, "params")
        )

        {:error, {:turn_cancelled, Map.get(payload, "params")}}

      {:ok, %{"method" => method} = payload} when is_binary(method) ->
        new_totals = maybe_update_token_totals(totals, method, payload)

        handle_turn_method(
          port,
          on_message,
          payload,
          payload_string,
          method,
          timeout_ms,
          tool_executor,
          auto_approve_requests,
          config,
          new_totals
        )

      {:ok, payload} ->
        emit_message(
          on_message,
          :other_message,
          %{payload: payload, raw: payload_string},
          metadata_from_message(port, payload)
        )

        receive_loop(
          port,
          on_message,
          timeout_ms,
          "",
          tool_executor,
          auto_approve_requests,
          config,
          totals
        )

      {:error, _reason} ->
        log_non_json_stream_line(payload_string, "turn stream")

        if protocol_message_candidate?(payload_string) do
          emit_message(
            on_message,
            :malformed,
            %{payload: payload_string, raw: payload_string},
            metadata_from_message(port, %{raw: payload_string})
          )
        end

        receive_loop(
          port,
          on_message,
          timeout_ms,
          "",
          tool_executor,
          auto_approve_requests,
          config,
          totals
        )
    end
  end

  defp emit_turn_event(on_message, event, payload, payload_string, port, payload_details) do
    emit_message(
      on_message,
      event,
      %{payload: payload, raw: payload_string, details: payload_details},
      metadata_from_message(port, payload)
    )
  end

  defp handle_turn_method(
         port,
         on_message,
         payload,
         payload_string,
         method,
         timeout_ms,
         tool_executor,
         auto_approve_requests,
         config,
         totals
       ) do
    metadata = metadata_from_message(port, payload)

    case maybe_handle_approval_request(
           port,
           method,
           payload,
           payload_string,
           on_message,
           metadata,
           tool_executor,
           auto_approve_requests
         ) do
      :input_required ->
        emit_message(
          on_message,
          :turn_input_required,
          %{payload: payload, raw: payload_string},
          metadata
        )

        {:error, {:turn_input_required, payload}}

      :approved ->
        receive_loop(
          port,
          on_message,
          timeout_ms,
          "",
          tool_executor,
          auto_approve_requests,
          config,
          totals
        )

      :approval_required ->
        emit_message(
          on_message,
          :approval_required,
          %{payload: payload, raw: payload_string},
          metadata
        )

        {:error, {:approval_required, payload}}

      :unhandled ->
        if needs_input?(method, payload) do
          emit_message(
            on_message,
            :turn_input_required,
            %{payload: payload, raw: payload_string},
            metadata
          )

          {:error, {:turn_input_required, payload}}
        else
          emit_message(
            on_message,
            :notification,
            %{payload: payload, raw: payload_string},
            metadata
          )

          Logger.debug("Codex notification: #{inspect(method)}")

          receive_loop(
            port,
            on_message,
            timeout_ms,
            "",
            tool_executor,
            auto_approve_requests,
            config,
            totals
          )
        end
    end
  end

  # ============== Approval, tool, and user-input policy (§ 10.5) ==============

  defp maybe_handle_approval_request(
         port,
         "item/commandExecution/requestApproval",
         %{"id" => id} = payload,
         payload_string,
         on_message,
         metadata,
         _tool_executor,
         auto_approve_requests
       ) do
    approve_or_require(
      port,
      id,
      "acceptForSession",
      payload,
      payload_string,
      on_message,
      metadata,
      auto_approve_requests
    )
  end

  defp maybe_handle_approval_request(
         port,
         "item/tool/call",
         %{"id" => id, "params" => params} = payload,
         payload_string,
         on_message,
         metadata,
         tool_executor,
         _auto_approve_requests
       ) do
    tool_name = tool_call_name(params)
    arguments = tool_call_arguments(params)

    result =
      tool_name
      |> tool_executor.(arguments)
      |> normalize_dynamic_tool_result()

    send_message(port, %{"id" => id, "result" => result})

    event =
      case result do
        %{"success" => true} -> :tool_call_completed
        _ when is_nil(tool_name) -> :unsupported_tool_call
        _ -> :tool_call_failed
      end

    emit_message(on_message, event, %{payload: payload, raw: payload_string}, metadata)

    :approved
  end

  defp maybe_handle_approval_request(
         port,
         "execCommandApproval",
         %{"id" => id} = payload,
         payload_string,
         on_message,
         metadata,
         _tool_executor,
         auto_approve_requests
       ) do
    approve_or_require(
      port,
      id,
      "approved_for_session",
      payload,
      payload_string,
      on_message,
      metadata,
      auto_approve_requests
    )
  end

  defp maybe_handle_approval_request(
         port,
         "applyPatchApproval",
         %{"id" => id} = payload,
         payload_string,
         on_message,
         metadata,
         _tool_executor,
         auto_approve_requests
       ) do
    approve_or_require(
      port,
      id,
      "approved_for_session",
      payload,
      payload_string,
      on_message,
      metadata,
      auto_approve_requests
    )
  end

  defp maybe_handle_approval_request(
         port,
         "item/fileChange/requestApproval",
         %{"id" => id} = payload,
         payload_string,
         on_message,
         metadata,
         _tool_executor,
         auto_approve_requests
       ) do
    approve_or_require(
      port,
      id,
      "acceptForSession",
      payload,
      payload_string,
      on_message,
      metadata,
      auto_approve_requests
    )
  end

  defp maybe_handle_approval_request(
         port,
         "item/tool/requestUserInput",
         %{"id" => id, "params" => params} = payload,
         payload_string,
         on_message,
         metadata,
         _tool_executor,
         auto_approve_requests
       ) do
    maybe_auto_answer_tool_request_user_input(
      port,
      id,
      params,
      payload,
      payload_string,
      on_message,
      metadata,
      auto_approve_requests
    )
  end

  defp maybe_handle_approval_request(
         _port,
         _method,
         _payload,
         _payload_string,
         _on_message,
         _metadata,
         _tool_executor,
         _auto_approve_requests
       ),
       do: :unhandled

  defp normalize_dynamic_tool_result(%{"success" => success} = result) when is_boolean(success) do
    output =
      case Map.get(result, "output") do
        existing_output when is_binary(existing_output) -> existing_output
        _ -> dynamic_tool_output(result)
      end

    content_items =
      case Map.get(result, "contentItems") do
        existing_items when is_list(existing_items) -> existing_items
        _ -> dynamic_tool_content_items(output)
      end

    result
    |> Map.put("output", output)
    |> Map.put("contentItems", content_items)
  end

  defp normalize_dynamic_tool_result(result) do
    %{
      "success" => false,
      "output" => inspect(result),
      "contentItems" => dynamic_tool_content_items(inspect(result))
    }
  end

  defp dynamic_tool_output(%{"contentItems" => [%{"text" => text} | _]}) when is_binary(text),
    do: text

  defp dynamic_tool_output(result), do: Jason.encode!(result, pretty: true)

  defp dynamic_tool_content_items(output) when is_binary(output) do
    [%{"type" => "inputText", "text" => output}]
  end

  defp approve_or_require(port, id, decision, payload, payload_string, on_message, metadata, true) do
    send_message(port, %{"id" => id, "result" => %{"decision" => decision}})

    emit_message(
      on_message,
      :approval_auto_approved,
      %{payload: payload, raw: payload_string, decision: decision},
      metadata
    )

    :approved
  end

  defp approve_or_require(
         _port,
         _id,
         _decision,
         _payload,
         _payload_string,
         _on_message,
         _metadata,
         false
       ),
       do: :approval_required

  defp maybe_auto_answer_tool_request_user_input(
         port,
         id,
         params,
         payload,
         payload_string,
         on_message,
         metadata,
         true
       ) do
    case tool_request_user_input_approval_answers(params) do
      {:ok, answers, decision} ->
        send_message(port, %{"id" => id, "result" => %{"answers" => answers}})

        emit_message(
          on_message,
          :approval_auto_approved,
          %{payload: payload, raw: payload_string, decision: decision},
          metadata
        )

        :approved

      :error ->
        reply_with_non_interactive_tool_input_answer(
          port,
          id,
          params,
          payload,
          payload_string,
          on_message,
          metadata
        )
    end
  end

  defp maybe_auto_answer_tool_request_user_input(
         port,
         id,
         params,
         payload,
         payload_string,
         on_message,
         metadata,
         false
       ) do
    reply_with_non_interactive_tool_input_answer(
      port,
      id,
      params,
      payload,
      payload_string,
      on_message,
      metadata
    )
  end

  defp tool_request_user_input_approval_answers(%{"questions" => questions})
       when is_list(questions) do
    answers =
      Enum.reduce_while(questions, %{}, fn question, acc ->
        case tool_request_user_input_approval_answer(question) do
          {:ok, question_id, answer_label} ->
            {:cont, Map.put(acc, question_id, %{"answers" => [answer_label]})}

          :error ->
            {:halt, :error}
        end
      end)

    case answers do
      :error -> :error
      answer_map when map_size(answer_map) > 0 -> {:ok, answer_map, "Approve this Session"}
      _ -> :error
    end
  end

  defp tool_request_user_input_approval_answers(_params), do: :error

  defp reply_with_non_interactive_tool_input_answer(
         port,
         id,
         params,
         payload,
         payload_string,
         on_message,
         metadata
       ) do
    case tool_request_user_input_unavailable_answers(params) do
      {:ok, answers} ->
        send_message(port, %{"id" => id, "result" => %{"answers" => answers}})

        emit_message(
          on_message,
          :tool_input_auto_answered,
          %{payload: payload, raw: payload_string, answer: @non_interactive_tool_input_answer},
          metadata
        )

        :approved

      :error ->
        :input_required
    end
  end

  defp tool_request_user_input_unavailable_answers(%{"questions" => questions})
       when is_list(questions) do
    answers =
      Enum.reduce_while(questions, %{}, fn question, acc ->
        case tool_request_user_input_question_id(question) do
          {:ok, question_id} ->
            {:cont,
             Map.put(acc, question_id, %{"answers" => [@non_interactive_tool_input_answer]})}

          :error ->
            {:halt, :error}
        end
      end)

    case answers do
      :error -> :error
      answer_map when map_size(answer_map) > 0 -> {:ok, answer_map}
      _ -> :error
    end
  end

  defp tool_request_user_input_unavailable_answers(_params), do: :error

  defp tool_request_user_input_question_id(%{"id" => question_id}) when is_binary(question_id),
    do: {:ok, question_id}

  defp tool_request_user_input_question_id(_question), do: :error

  defp tool_request_user_input_approval_answer(%{"id" => question_id, "options" => options})
       when is_binary(question_id) and is_list(options) do
    case tool_request_user_input_approval_option_label(options) do
      nil -> :error
      answer_label -> {:ok, question_id, answer_label}
    end
  end

  defp tool_request_user_input_approval_answer(_question), do: :error

  defp tool_request_user_input_approval_option_label(options) do
    options
    |> Enum.map(&tool_request_user_input_option_label/1)
    |> Enum.reject(&is_nil/1)
    |> case do
      labels ->
        Enum.find(labels, &(&1 == "Approve this Session")) ||
          Enum.find(labels, &(&1 == "Approve Once")) ||
          Enum.find(labels, &approval_option_label?/1)
    end
  end

  defp tool_request_user_input_option_label(%{"label" => label}) when is_binary(label), do: label
  defp tool_request_user_input_option_label(_option), do: nil

  defp approval_option_label?(label) when is_binary(label) do
    normalized_label = label |> String.trim() |> String.downcase()

    String.starts_with?(normalized_label, "approve") or
      String.starts_with?(normalized_label, "allow")
  end

  # ============== Sync request/response (§ 10.6) ==============

  defp await_response(port, request_id, config) do
    with_timeout_response(port, request_id, read_timeout_ms(config), "")
  end

  defp with_timeout_response(port, request_id, timeout_ms, pending_line) do
    receive do
      {^port, {:data, {:eol, chunk}}} ->
        complete_line = pending_line <> to_string(chunk)
        handle_response(port, request_id, complete_line, timeout_ms)

      {^port, {:data, {:noeol, chunk}}} ->
        with_timeout_response(port, request_id, timeout_ms, pending_line <> to_string(chunk))

      {^port, {:exit_status, status}} ->
        {:error, {:port_exit, status}}
    after
      timeout_ms ->
        {:error, :response_timeout}
    end
  end

  defp handle_response(port, request_id, data, timeout_ms) do
    payload = to_string(data)

    case Jason.decode(payload) do
      {:ok, %{"id" => ^request_id, "error" => error}} ->
        {:error, {:response_error, error}}

      {:ok, %{"id" => ^request_id, "result" => result}} ->
        {:ok, result}

      {:ok, %{"id" => ^request_id} = response_payload} ->
        {:error, {:response_error, response_payload}}

      {:ok, %{} = other} ->
        Logger.debug("Ignoring message while waiting for response: #{inspect(other)}")
        with_timeout_response(port, request_id, timeout_ms, "")

      {:error, _} ->
        log_non_json_stream_line(payload, "response stream")
        with_timeout_response(port, request_id, timeout_ms, "")
    end
  end

  # ============== Token accounting (§ 13.5) ==============
  # Cumulative thread totals come from `thread/tokenUsage/updated`. We
  # also accept an inlined `total_token_usage` block on token-count
  # wrapper events. Per-event delta keys (`last_token_usage`) are
  # ignored intentionally — see spec § 13.5.
  defp maybe_update_token_totals(totals, "thread/tokenUsage/updated", payload) do
    extract_totals(payload) || totals
  end

  defp maybe_update_token_totals(totals, _method, payload) do
    case extract_total_token_usage(payload) do
      nil -> totals
      next -> next
    end
  end

  defp extract_totals(payload) when is_map(payload) do
    candidates =
      [
        get_in(payload, ["params", "totalTokenUsage"]),
        get_in(payload, ["params", "total_token_usage"]),
        get_in(payload, ["params", "usage"]),
        get_in(payload, ["params"]),
        Map.get(payload, "totalTokenUsage"),
        Map.get(payload, "total_token_usage"),
        Map.get(payload, "usage")
      ]
      |> Enum.reject(&is_nil/1)

    Enum.find_value(candidates, nil, &usage_to_totals/1)
  end

  defp extract_totals(_payload), do: nil

  defp extract_total_token_usage(payload) when is_map(payload) do
    [
      get_in(payload, ["params", "totalTokenUsage"]),
      get_in(payload, ["params", "total_token_usage"]),
      Map.get(payload, "totalTokenUsage"),
      Map.get(payload, "total_token_usage")
    ]
    |> Enum.reject(&is_nil/1)
    |> Enum.find_value(nil, &usage_to_totals/1)
  end

  defp extract_total_token_usage(_payload), do: nil

  defp usage_to_totals(usage) when is_map(usage) do
    input =
      pick_token(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"])

    output =
      pick_token(usage, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"])

    total =
      pick_token(usage, ["total_tokens", "totalTokens", "tokens"])

    cond do
      input == nil and output == nil and total == nil ->
        nil

      true ->
        in_v = input || 0
        out_v = output || 0
        total_v = total || in_v + out_v
        %{input: in_v, output: out_v, total: total_v}
    end
  end

  defp usage_to_totals(_), do: nil

  defp pick_token(map, keys) do
    Enum.find_value(keys, nil, fn key ->
      case Map.get(map, key) do
        v when is_integer(v) ->
          v

        v when is_binary(v) ->
          case Integer.parse(v) do
            {n, ""} -> n
            _ -> nil
          end

        _ ->
          nil
      end
    end)
  end

  # ============== Misc helpers ==============

  defp log_non_json_stream_line(data, stream_label) do
    text =
      data
      |> to_string()
      |> String.trim()
      |> String.slice(0, @max_stream_log_bytes)

    if text != "" do
      if String.match?(text, ~r/\b(error|warn|warning|failed|fatal|panic|exception)\b/i) do
        Logger.warning("Codex #{stream_label} output: #{text}")
      else
        Logger.debug("Codex #{stream_label} output: #{text}")
      end
    end
  end

  defp protocol_message_candidate?(data) do
    data |> to_string() |> String.trim_leading() |> String.starts_with?("{")
  end

  defp issue_context(%{id: issue_id, identifier: identifier}),
    do: "issue_id=#{issue_id} issue_identifier=#{identifier}"

  defp issue_context(%{identifier: identifier}), do: "issue_identifier=#{identifier}"
  defp issue_context(_), do: "issue_id=unknown"

  defp stop_port(port) when is_port(port) do
    case :erlang.port_info(port) do
      :undefined ->
        :ok

      _ ->
        try do
          Port.close(port)
          :ok
        rescue
          ArgumentError -> :ok
        end
    end
  end

  defp emit_message(on_message, event, details, metadata) when is_function(on_message, 1) do
    message =
      metadata
      |> Map.merge(details)
      |> Map.put(:event, event)
      |> Map.put(:timestamp, DateTime.utc_now())

    on_message.(message)
  end

  defp metadata_from_message(port, payload) do
    port |> port_metadata() |> maybe_set_usage(payload)
  end

  defp maybe_set_usage(metadata, payload) when is_map(payload) do
    usage = Map.get(payload, "usage") || Map.get(payload, :usage)
    if is_map(usage), do: Map.put(metadata, :usage, usage), else: metadata
  end

  defp maybe_set_usage(metadata, _payload), do: metadata

  defp default_on_message(_message), do: :ok

  defp tool_call_name(params) when is_map(params) do
    case Map.get(params, "tool") || Map.get(params, :tool) || Map.get(params, "name") ||
           Map.get(params, :name) do
      name when is_binary(name) ->
        case String.trim(name) do
          "" -> nil
          trimmed -> trimmed
        end

      _ ->
        nil
    end
  end

  defp tool_call_name(_params), do: nil

  defp tool_call_arguments(params) when is_map(params),
    do: Map.get(params, "arguments") || Map.get(params, :arguments) || %{}

  defp tool_call_arguments(_params), do: %{}

  defp send_message(port, message) do
    line = Jason.encode!(message) <> "\n"
    Port.command(port, line)
  end

  defp needs_input?(method, payload) when is_binary(method) and is_map(payload) do
    String.starts_with?(method, "turn/") and input_required_method?(method, payload)
  end

  defp needs_input?(_method, _payload), do: false

  defp input_required_method?(method, payload) when is_binary(method) do
    method in [
      "turn/input_required",
      "turn/needs_input",
      "turn/need_input",
      "turn/request_input",
      "turn/request_response",
      "turn/provide_input",
      "turn/approval_required"
    ] or request_payload_requires_input?(payload)
  end

  defp request_payload_requires_input?(payload) do
    params = Map.get(payload, "params")
    needs_input_field?(payload) or needs_input_field?(params)
  end

  defp needs_input_field?(payload) when is_map(payload) do
    Map.get(payload, "requiresInput") == true or
      Map.get(payload, "needsInput") == true or
      Map.get(payload, "input_required") == true or
      Map.get(payload, "inputRequired") == true or
      Map.get(payload, "type") == "input_required" or
      Map.get(payload, "type") == "needs_input"
  end

  defp needs_input_field?(_payload), do: false

  # ============== Config plumbing ==============

  # § 10.5 high-trust default. The orchestrator may override the default
  # by setting `codex.approval_policy` in WORKFLOW.md. Auto-approval
  # kicks in when the resolved policy is `"never"` (i.e., never ask).
  defp session_policies(config, workspace, opts) do
    codex = codex_settings(config)

    approval_policy =
      Keyword.get(opts, :approval_policy) ||
        non_empty(codex.approval_policy) ||
        "never"

    thread_sandbox =
      Keyword.get(opts, :thread_sandbox) ||
        non_empty(codex.thread_sandbox) ||
        "workspace-write"

    turn_sandbox_policy =
      Keyword.get(opts, :turn_sandbox_policy) ||
        non_empty(codex.turn_sandbox_policy) ||
        default_turn_sandbox_policy(workspace)

    %{
      approval_policy: approval_policy,
      thread_sandbox: thread_sandbox,
      turn_sandbox_policy: turn_sandbox_policy
    }
  end

  defp codex_settings(%Symphony.Config.Settings{schema: schema}), do: schema.codex
  defp codex_settings(%Symphony.Config.Schema{} = schema), do: schema.codex
  defp codex_settings(_), do: %{}

  defp non_empty(nil), do: nil
  defp non_empty(""), do: nil
  defp non_empty(v), do: v

  defp default_turn_sandbox_policy(workspace) do
    %{
      "type" => "workspaceWrite",
      "writableRoots" => [workspace],
      "readOnlyAccess" => %{"type" => "fullAccess"},
      "networkAccess" => false,
      "excludeTmpdirEnvVar" => false,
      "excludeSlashTmp" => false
    }
  end

  defp auto_approve?("never"), do: true
  defp auto_approve?(%{"mode" => "never"}), do: true
  defp auto_approve?(_), do: false

  # When the active tracker is Linear, expose the `linear_graphql`
  # dynamic tool. For other tracker kinds we still send an empty
  # `dynamicTools` array (the field's presence is harmless).
  defp advertised_tool_specs(config) do
    case Config.tracker_kind(config) do
      :linear -> DynamicTool.tool_specs()
      _ -> []
    end
  end

  defp dynamic_tool_opts(config) do
    [
      tracker_endpoint: safe_get(config, &Config.tracker_endpoint/1),
      tracker_api_key: safe_get(config, &Config.tracker_api_key/1)
    ]
    |> Enum.reject(fn {_, v} -> is_nil(v) end)
  end

  defp safe_get(config, fun) do
    fun.(config)
  rescue
    _ -> nil
  end

  defp read_timeout_ms(config), do: Config.codex_read_timeout_ms(config)

  defp turn_timeout_ms(config), do: Config.codex_turn_timeout_ms(config)

  # Workspace assertion is exposed for the runner adapter — it lets the
  # adapter sanity-check workspaces before opening a port (mirrors §
  # 9.5).
  @doc false
  def assert_inside_workspace_root!(config, workspace) do
    WorkspaceManager.assert_inside_root!(Config.workspace_root(config), workspace)
  end
end
