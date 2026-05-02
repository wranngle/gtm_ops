defmodule Symphony.Codex.AppServerTest do
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias Symphony.Codex.AppServer
  alias Symphony.{Config, WorkflowLoader}

  # ============== Setup helpers ==============

  setup do
    test_root =
      Path.join(System.tmp_dir!(), "symphony-codex-app-server-#{System.unique_integer([:positive])}")

    File.mkdir_p!(test_root)
    on_exit(fn -> File.rm_rf!(test_root) end)
    {:ok, test_root: test_root}
  end

  defp issue do
    %{
      id: "issue-MT-123",
      identifier: "MT-123",
      title: "Validate Codex app-server adapter",
      state: "in_progress"
    }
  end

  defp build_config(test_root, codex_command) do
    workflow_path = Path.join(test_root, "WORKFLOW.md")
    workspace_root = Path.join(test_root, "workspaces")

    File.write!(workflow_path, """
    ---
    workspace:
      root: #{workspace_root}
    codex:
      command: #{codex_command}
      read_timeout_ms: 5000
      turn_timeout_ms: 5000
    ---
    Prompt for {{ issue.identifier }}.
    """)

    {:ok, workflow} = WorkflowLoader.load(workflow_path)
    {:ok, config} = Config.from_workflow(workflow)
    config
  end

  defp write_codex_script!(path, body) do
    File.write!(path, body)
    File.chmod!(path, 0o755)
  end

  # A "happy path" fake-codex stdout transcript that completes a turn
  # immediately. Each shell loop turn corresponds to one inbound JSON
  # line on stdin from our client. The pre-emptive response pattern
  # works because each request id (1=initialize, 2=thread/start,
  # 3=turn/start) is independent — the client buffers stdout lines and
  # matches by id.
  #
  # Step counts:
  #   1) recv initialize -> emit id=1 response
  #   2) recv initialized notification -> emit id=2 (thread response, eager)
  #   3) recv thread/start -> emit id=3 (turn response, eager)
  #   4) recv turn/start -> emit turn/completed and exit
  defp happy_codex_script(thread_id, turn_id) do
    """
    #!/bin/sh
    count=0
    while IFS= read -r line; do
      count=$((count + 1))
      case "$count" in
        1) printf '%s\\n' '{"id":1,"result":{}}' ;;
        2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"#{thread_id}"}}}' ;;
        3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"#{turn_id}"}}}' ;;
        4) printf '%s\\n' '{"method":"turn/completed"}'
           exit 0 ;;
        *) exit 0 ;;
      esac
    done
    """
  end

  # ============== Workspace cwd validation (§ 9.5 + § 10.1) ==============

  describe "workspace cwd validation" do
    test "rejects the workspace root itself", %{test_root: test_root} do
      config = build_config(test_root, "/bin/true")
      ws_root = Path.join(test_root, "workspaces")
      File.mkdir_p!(ws_root)

      assert {:error, {:invalid_workspace_cwd, :workspace_root, _}} =
               AppServer.run(config, ws_root, "prompt", issue())
    end

    test "rejects paths outside the workspace root", %{test_root: test_root} do
      config = build_config(test_root, "/bin/true")
      outside = Path.join(test_root, "outside")
      File.mkdir_p!(outside)

      assert {:error, {:invalid_workspace_cwd, :outside_workspace_root, _, _}} =
               AppServer.run(config, outside, "prompt", issue())
    end
  end

  # ============== Session id composition (§ 10.2) ==============

  describe "session_id composition" do
    test "composes session_id as <thread_id>-<turn_id> from JSON-RPC results",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")
      write_codex_script!(codex_binary, happy_codex_script("thr_123", "turn_xyz"))

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      assert {:ok, %{session_id: session_id, thread_id: tid, turn_id: turnid}} =
               AppServer.run(config, workspace, "prompt", issue())

      assert tid == "thr_123"
      assert turnid == "turn_xyz"
      assert session_id == "thr_123-turn_xyz"
    end
  end

  # ============== Streaming + buffering (§ 10.3) ==============

  describe "line buffering" do
    test "handles partial JSON lines spanning multiple chunks (10MB cap)",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")
      # Pad the initialize response with ~1.1MB of filler so it forces
      # line buffering — this verifies the partial-line path. The
      # `noeol`/`eol` chunk path inside the receive loop must
      # concatenate before JSON-decoding.
      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1)
            padding=$(printf '%*s' 1100000 '' | tr ' ' a)
            printf '{"id":1,"result":{},"padding":"%s"}\\n' "$padding"
            ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_part"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_part"}}}' ;;
          4) printf '%s\\n' '{"method":"turn/completed"}'
             exit 0 ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      assert {:ok, %{session_id: "thr_part-turn_part"}} =
               AppServer.run(config, workspace, "prompt", issue())
    end

    test "captures non-JSON stderr/stdout noise as diagnostic logs",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_noise"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_noise"}}}' ;;
          4) printf '%s\\n' 'warning: this is stderr noise' >&2
             printf '%s\\n' '{"method":"turn/completed"}'
             exit 0 ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      log =
        capture_log(fn ->
          assert {:ok, _} = AppServer.run(config, workspace, "prompt", issue())
        end)

      assert log =~ "warning: this is stderr noise"
    end

    test "emits :malformed event for JSON-like protocol lines that fail to decode",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_mal"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_mal"}}}' ;;
          4) printf '%s\\n' '{"method":"turn/completed"'
             printf '%s\\n' '{"method":"turn/completed"}'
             exit 0 ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      test_pid = self()
      on_message = fn message -> send(test_pid, {:app_server_message, message}) end

      assert {:ok, _} =
               AppServer.run(config, workspace, "prompt", issue(), on_message: on_message)

      assert_received {:app_server_message, %{event: :malformed}}
      assert_received {:app_server_message, %{event: :turn_completed}}
    end
  end

  # ============== Approval + user-input policy (§ 10.5) ==============

  describe "approval policy" do
    test "auto-approves command-execution requests under high-trust default",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_app"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_app"}}}'
             printf '%s\\n' '{"id":99,"method":"item/commandExecution/requestApproval","params":{"command":"gh pr view"}}'
             ;;
          4) printf '%s\\n' '{"method":"turn/completed"}' ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      test_pid = self()
      on_message = fn msg -> send(test_pid, {:msg, msg}) end

      assert {:ok, _} =
               AppServer.run(config, workspace, "prompt", issue(), on_message: on_message)

      # The session must auto-approve the command execution request and
      # emit the corresponding event with the right decision.
      assert_received {:msg,
                       %{
                         event: :approval_auto_approved,
                         decision: "acceptForSession",
                         payload: %{"method" => "item/commandExecution/requestApproval"}
                       }}
    end

    test "fails the turn when codex demands free-form user input",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_in"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_in"}}}'
             printf '%s\\n' '{"method":"turn/input_required","id":"resp-1","params":{"requiresInput":true,"reason":"blocked"}}'
             ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      assert {:error, {:turn_input_required, payload}} =
               AppServer.run(config, workspace, "prompt", issue())

      assert payload["method"] == "turn/input_required"
    end

    test "auto-answers MCP tool approval prompts with 'Approve this Session'",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_mcp"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_mcp"}}}'
             printf '%s\\n' '{"id":110,"method":"item/tool/requestUserInput","params":{"itemId":"call-1","questions":[{"id":"q-1","options":[{"label":"Approve Once"},{"label":"Approve this Session"},{"label":"Deny"}],"question":"Run tool?"}]}}'
             ;;
          4) printf '%s\\n' '{"method":"turn/completed"}' ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      test_pid = self()
      on_message = fn msg -> send(test_pid, {:msg, msg}) end

      assert {:ok, _} =
               AppServer.run(config, workspace, "prompt", issue(), on_message: on_message)

      # MCP tool prompts get auto-answered with the approval decision
      # label so the agent never stalls waiting for an operator.
      assert_received {:msg,
                       %{
                         event: :approval_auto_approved,
                         decision: "Approve this Session",
                         payload: %{"method" => "item/tool/requestUserInput"}
                       }}
    end
  end

  # ============== Tool calls (§ 10.5) ==============

  describe "dynamic tool calls" do
    test "rejects unsupported dynamic tool calls without stalling the turn",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_us"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_us"}}}'
             printf '%s\\n' '{"id":101,"method":"item/tool/call","params":{"tool":"some_tool","arguments":{}}}'
             ;;
          4) printf '%s\\n' '{"method":"turn/completed"}' ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      test_pid = self()
      on_message = fn msg -> send(test_pid, {:msg, msg}) end

      # Use a tool executor that returns the same payload as DynamicTool
      # for nil/unsupported names so we can assert on what gets emitted
      # without relying on trace-file flushing.
      assert {:ok, _} =
               AppServer.run(config, workspace, "prompt", issue(), on_message: on_message)

      # The session must not stall — we get turn_completed.
      assert_received {:msg, %{event: :turn_completed}}

      # And we must have emitted :tool_call_failed for the bogus tool
      # (DynamicTool.execute returns success=false for unknown tools,
      # which the AppServer surfaces as :tool_call_failed for non-nil
      # names — :unsupported_tool_call is reserved for nil names).
      assert_received {:msg,
                       %{
                         event: :tool_call_failed,
                         payload: %{"params" => %{"tool" => "some_tool"}}
                       }}
    end

    test "executes a custom tool_executor and emits :tool_call_completed when successful",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_te"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_te"}}}'
             printf '%s\\n' '{"id":102,"method":"item/tool/call","params":{"name":"linear_graphql","arguments":{"query":"query { ok }"}}}'
             ;;
          4) printf '%s\\n' '{"method":"turn/completed"}' ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      test_pid = self()

      tool_executor = fn tool, args ->
        send(test_pid, {:tool_called, tool, args})

        %{
          "success" => true,
          "contentItems" => [%{"type" => "inputText", "text" => ~s({"data":{"viewer":{"id":"u_1"}}})}]
        }
      end

      on_message = fn msg -> send(test_pid, {:msg, msg}) end

      assert {:ok, _} =
               AppServer.run(config, workspace, "prompt", issue(),
                 tool_executor: tool_executor,
                 on_message: on_message
               )

      # Tool executor was invoked with parsed arguments.
      assert_received {:tool_called, "linear_graphql", %{"query" => "query { ok }"}}

      # The success result was relayed back as :tool_call_completed.
      assert_received {:msg, %{event: :tool_call_completed}}
    end
  end

  # ============== Error mapping (§ 10.6) ==============

  describe "error mapping" do
    test "surfaces :port_exit when the Codex subprocess crashes early",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      # Crash before the initialize response so the client can never
      # complete the handshake.
      exit 17
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      assert {:error, {:port_exit, 17}} =
               AppServer.run(config, workspace, "prompt", issue())
    end

    test "surfaces :response_timeout when the handshake exceeds read_timeout_ms",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      # Sleep forever so the initialize response never comes.
      write_codex_script!(codex_binary, """
      #!/bin/sh
      while IFS= read -r line; do
        sleep 60
      done
      """)

      workflow_path = Path.join(test_root, "WORKFLOW.md")
      workspace_root = Path.join(test_root, "workspaces")

      File.write!(workflow_path, """
      ---
      workspace:
        root: #{workspace_root}
      codex:
        command: #{codex_binary}
        read_timeout_ms: 200
        turn_timeout_ms: 5000
      ---
      Prompt for {{ issue.identifier }}.
      """)

      {:ok, workflow} = WorkflowLoader.load(workflow_path)
      {:ok, config} = Config.from_workflow(workflow)
      workspace = Path.join([workspace_root, "MT-123"])
      File.mkdir_p!(workspace)

      assert {:error, :response_timeout} =
               AppServer.run(config, workspace, "prompt", issue())
    end
  end

  # ============== Token accounting (§ 13.5) ==============

  describe "token accounting" do
    test "extracts cumulative thread totals from thread/tokenUsage/updated and ignores last_token_usage deltas",
         %{test_root: test_root} do
      codex_binary = Path.join(test_root, "fake-codex")

      write_codex_script!(codex_binary, """
      #!/bin/sh
      count=0
      while IFS= read -r line; do
        count=$((count + 1))
        case "$count" in
          1) printf '%s\\n' '{"id":1,"result":{}}' ;;
          2) printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thr_tok"}}}' ;;
          3) printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn_tok"}}}'
             # First a misleading delta payload — should be ignored.
             printf '%s\\n' '{"method":"agent/last_token_usage","params":{"last_token_usage":{"input_tokens":99,"output_tokens":99,"total_tokens":99}}}'
             # Then the cumulative thread total — should win.
             printf '%s\\n' '{"method":"thread/tokenUsage/updated","params":{"totalTokenUsage":{"input_tokens":1500,"output_tokens":250,"total_tokens":1750}}}'
             ;;
          4) printf '%s\\n' '{"method":"turn/completed"}'
             exit 0 ;;
          *) exit 0 ;;
        esac
      done
      """)

      config = build_config(test_root, codex_binary)
      workspace = Path.join([test_root, "workspaces", "MT-123"])
      File.mkdir_p!(workspace)

      assert {:ok, %{tokens: tokens}} =
               AppServer.run(config, workspace, "prompt", issue())

      assert tokens.input == 1500
      assert tokens.output == 250
      assert tokens.total == 1750
    end
  end

end
