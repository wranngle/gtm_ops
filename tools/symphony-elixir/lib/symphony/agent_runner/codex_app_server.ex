defmodule Symphony.AgentRunner.CodexAppServer do
  @moduledoc """
  Agent runner adapter that drives the Codex app-server JSON-RPC client
  per spec section 10.

  Lifecycle per attempt (mirrors the LocalShell adapter so the
  orchestrator's `attempt_result` shape stays uniform):

    1. Assert workspace safety invariants (§ 9.5).
    2. Fire `before_run` hook; bail if non-zero.
    3. Render prompt via `Symphony.PromptRenderer`.
    4. Write `rendered-prompt.md` inside the workspace.
    5. Open one Codex app-server session and run `turn/start` on it.
    6. Optionally loop continuation turns up to `agent.max_turns`,
       reusing the same `thread_id`.
    7. Always tear down the session in an `after` block.
    8. Fire `after_run` hook (logged-and-ignored on failure, per § 9.4).
    9. Persist a transcript at `agent-output-<UTC-ts>.md` so the
       orchestrator/operator can read what the agent produced.

  The adapter never raises out of `run/4`; failures come back as
  `{:error, reason}` so the orchestrator can decide retry vs. handoff.
  """

  @behaviour Symphony.AgentRunner

  alias Symphony.{Codex.AppServer, Config, PromptRenderer, Tracker, WorkflowLoader, WorkspaceManager}

  require Logger

  # § 12.3: continuation turns reuse the same prompt context as the
  # initial turn so we don't restart the agent's reasoning. Override
  # via `:continuation_template` if the orchestrator needs a different
  # nudge.
  @default_continuation_guidance """
  Continuation guidance:

  - The previous Codex turn completed normally, but the issue is still in an active state.
  - Resume from the current workspace state instead of restarting from scratch.
  - The original task instructions and prior turn context are already present in this thread; do not restate them before acting.
  - Focus on the remaining work and do not end the turn while the issue stays active unless you are truly blocked.
  """

  @default_max_turns 4

  @impl true
  def run(config, %Tracker.Issue{} = issue, workspace, opts \\ []) do
    started_at = System.monotonic_time(:millisecond)
    template = Keyword.get(opts, :template, default_template(config))
    attempt = Keyword.get(opts, :attempt)
    max_turns = max_turns(config, opts)
    on_message = Keyword.get(opts, :on_message, &noop_on_message/1)
    issue_state_fetcher = Keyword.get(opts, :issue_state_fetcher, &default_issue_state_fetcher/2)

    with :ok <-
           WorkspaceManager.assert_inside_root!(Config.workspace_root(config), workspace.path)
           |> ok_if_no_raise(),
         :ok <- run_before_hooks(config, workspace),
         {:ok, rendered} <-
           PromptRenderer.render(%{template: template, issue: issue, attempt: attempt}),
         {:ok, prompt_path} <- write_rendered_prompt(workspace, rendered),
         {:ok, session} <- AppServer.start_session(config, workspace.path, opts) do
      transcript_path = Path.join(workspace.path, "agent-output-#{utc_stamp()}.md")
      transcript_io = File.open!(transcript_path, [:write, :utf8])

      try do
        wrapped_on_message = wrap_on_message(transcript_io, on_message)

        outcome =
          run_turns(
            config,
            session,
            issue,
            rendered,
            wrapped_on_message,
            issue_state_fetcher,
            opts,
            max_turns,
            1
          )

        finalize(
          config,
          workspace,
          outcome,
          transcript_path,
          prompt_path,
          started_at,
          issue
        )
      after
        File.close(transcript_io)
        AppServer.stop_session(session)
      end
    else
      {:error, reason} = err ->
        _ = WorkspaceManager.run_hook(config, workspace, :after_run)

        Logger.warning(
          "symphony.agent_attempt outcome=failure adapter=codex_app_server identifier=#{issue.identifier} reason=#{inspect(reason)}"
        )

        err
    end
  end

  # ============== Turn loop ==============

  defp run_turns(_config, _session, _issue, _prompt, _on_message, _fetcher, _opts, max_turns, turn_number)
       when turn_number > max_turns do
    {:ok, %{exit_code: 0, last_session_id: nil, turns: max_turns}}
  end

  defp run_turns(config, session, issue, prompt, on_message, fetcher, opts, max_turns, turn_number) do
    turn_prompt = build_turn_prompt(prompt, opts, turn_number)

    case AppServer.run_turn(session, turn_prompt, issue, opts ++ [on_message: on_message]) do
      {:ok, %{session_id: session_id} = turn_result} ->
        Logger.info(
          "symphony.codex_turn outcome=success identifier=#{issue.identifier} turn=#{turn_number}/#{max_turns} session_id=#{session_id}"
        )

        case continue_with_issue?(config, issue, fetcher) do
          {:continue, refreshed_issue} when turn_number < max_turns ->
            Logger.info(
              "symphony.codex_turn continuation identifier=#{refreshed_issue.identifier} turn=#{turn_number}/#{max_turns}"
            )

            run_turns(
              config,
              session,
              refreshed_issue,
              prompt,
              on_message,
              fetcher,
              opts,
              max_turns,
              turn_number + 1
            )

          {:continue, refreshed_issue} ->
            Logger.info(
              "symphony.codex_turn max_turns_reached identifier=#{refreshed_issue.identifier} turn=#{turn_number}/#{max_turns}"
            )

            {:ok,
             %{
               exit_code: 0,
               last_session_id: session_id,
               last_turn_result: turn_result,
               turns: turn_number,
               handoff: :max_turns
             }}

          {:done, _refreshed_issue} ->
            {:ok,
             %{
               exit_code: 0,
               last_session_id: session_id,
               last_turn_result: turn_result,
               turns: turn_number,
               handoff: :issue_terminal
             }}

          {:error, reason} ->
            {:error, {:issue_state_refresh_failed, reason}}
        end

      {:error, reason} ->
        {:error, {:turn_failed, reason, turn_number}}
    end
  end

  defp build_turn_prompt(rendered, _opts, 1), do: rendered

  defp build_turn_prompt(_rendered, opts, _turn_number) do
    Keyword.get(opts, :continuation_template, @default_continuation_guidance)
  end

  # ============== Result shaping ==============

  defp finalize(config, workspace, {:ok, run_summary}, transcript_path, prompt_path, started_at, issue) do
    _ = WorkspaceManager.run_hook(config, workspace, :after_run)
    duration_ms = System.monotonic_time(:millisecond) - started_at

    Logger.info(
      "symphony.agent_attempt outcome=success adapter=codex_app_server identifier=#{issue.identifier} turns=#{run_summary.turns} duration_ms=#{duration_ms}"
    )

    {:ok,
     %{
       output_path: transcript_path,
       rendered_prompt_path: prompt_path,
       exit_code: run_summary.exit_code,
       duration_ms: duration_ms
     }}
  end

  defp finalize(config, workspace, {:error, reason}, _transcript_path, _prompt_path, _started_at, issue) do
    _ = WorkspaceManager.run_hook(config, workspace, :after_run)

    Logger.warning(
      "symphony.agent_attempt outcome=failure adapter=codex_app_server identifier=#{issue.identifier} reason=#{inspect(reason)}"
    )

    {:error, reason}
  end

  # ============== Lifecycle helpers ==============

  defp run_before_hooks(config, workspace) do
    case workspace.created_now do
      true ->
        with :ok <- WorkspaceManager.run_hook(config, workspace, :after_create),
             :ok <- WorkspaceManager.run_hook(config, workspace, :before_run) do
          :ok
        end

      false ->
        WorkspaceManager.run_hook(config, workspace, :before_run)
    end
  end

  defp write_rendered_prompt(workspace, rendered) do
    path = Path.join(workspace.path, "rendered-prompt.md")
    File.write!(path, rendered)
    {:ok, path}
  end

  defp wrap_on_message(transcript_io, user_callback) do
    fn message ->
      _ = write_transcript(transcript_io, message)

      try do
        user_callback.(message)
      rescue
        e -> Logger.warning("symphony.codex_on_message_failed #{inspect(e)}")
      end

      :ok
    end
  end

  defp write_transcript(transcript_io, %{event: event} = message) do
    payload = %{
      "@timestamp" => message[:timestamp] && DateTime.to_iso8601(message[:timestamp]),
      "event" => Atom.to_string(event),
      "session_id" => message[:session_id],
      "raw" => message[:raw]
    }

    encoded = Jason.encode!(Map.reject(payload, fn {_, v} -> is_nil(v) end))
    IO.write(transcript_io, encoded <> "\n")
  end

  defp write_transcript(_transcript_io, _message), do: :ok

  defp noop_on_message(_message), do: :ok

  defp default_template(config) do
    fallback = "You are working on an issue from Linear."

    case WorkflowLoader.load(config.source_path) do
      {:ok, %{prompt_template: ""}} -> fallback
      {:ok, %{prompt_template: tpl}} when is_binary(tpl) and tpl != "" -> tpl
      _ -> fallback
    end
  end

  defp max_turns(config, opts) do
    case Keyword.get(opts, :max_turns) do
      v when is_integer(v) and v > 0 ->
        v

      _ ->
        case Map.get(config.resolved, "agent.max_turns") do
          v when is_integer(v) and v > 0 -> v
          _ -> @default_max_turns
        end
    end
  end

  defp continue_with_issue?(config, %Tracker.Issue{id: issue_id} = issue, fetcher)
       when is_binary(issue_id) and issue_id != "" do
    case fetcher.(config, [issue_id]) do
      {:ok, %{} = state_map} when map_size(state_map) > 0 ->
        case Map.get(state_map, issue_id) do
          state when is_binary(state) ->
            refreshed = %{issue | state: state}

            if active_state?(config, state) do
              {:continue, refreshed}
            else
              {:done, refreshed}
            end

          _ ->
            {:done, issue}
        end

      {:ok, _empty} ->
        {:done, issue}

      {:error, reason} ->
        {:error, reason}

      _other ->
        {:done, issue}
    end
  end

  defp continue_with_issue?(_config, issue, _fetcher), do: {:done, issue}

  defp active_state?(config, state_name) when is_binary(state_name) do
    normalized = state_name |> String.trim() |> String.downcase()

    Config.tracker_active_states(config)
    |> Enum.any?(fn s -> String.trim(s) |> String.downcase() == normalized end)
  end

  defp active_state?(_config, _state_name), do: false

  defp default_issue_state_fetcher(config, issue_ids) do
    case Tracker.adapter_for(config) do
      {:ok, adapter} -> adapter.fetch_issue_states_by_ids(config, issue_ids)
      {:error, reason} -> {:error, reason}
    end
  end

  defp utc_stamp do
    {{y, m, d}, {hh, mm, ss}} = :calendar.universal_time()

    :io_lib.format("~4..0B~2..0B~2..0BT~2..0B~2..0B~2..0BZ", [y, m, d, hh, mm, ss])
    |> IO.iodata_to_binary()
  end

  defp ok_if_no_raise(:ok), do: :ok
end
