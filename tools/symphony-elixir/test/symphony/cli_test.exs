defmodule Symphony.CLITest do
  @moduledoc """
  Spec § 13.3 / operator UX: CLI subcommand dispatch should map each
  argv shape to the corresponding in-app module without crashing.
  """

  use ExUnit.Case, async: true

  alias Symphony.CLI

  defp deps_with_capture(stub_workflow_response \\ nil) do
    test_pid = self()

    %{
      ensure_started: fn ->
        send(test_pid, :ensure_started_called)
        :ok
      end,
      load_workflow: fn _path ->
        send(test_pid, :load_workflow_called)

        case stub_workflow_response do
          nil ->
            {:error, {:missing_workflow_file, "WORKFLOW.md", :enoent}}

          response ->
            response
        end
      end,
      io_puts: fn msg ->
        send(test_pid, {:stdout, msg})
        :ok
      end,
      io_err: fn msg ->
        send(test_pid, {:stderr, msg})
        :ok
      end,
      halt: fn code ->
        send(test_pid, {:halt, code})
        :ok
      end,
      wait_forever: fn ->
        send(test_pid, :wait_forever_called)
        :ok
      end
    }
  end

  describe "--help" do
    test "renders usage" do
      assert CLI.run(["--help"], deps_with_capture()) == :ok
      assert_received {:stdout, msg}
      assert msg =~ "Usage: symphony"
      assert msg =~ "validate"
      assert msg =~ "list"
      assert msg =~ "once"
      assert msg =~ "serve"
    end

    test "renders usage when invoked without subcommand" do
      assert CLI.run([], deps_with_capture()) == :ok
      assert_received {:stdout, msg}
      assert msg =~ "Usage: symphony"
    end
  end

  describe "validate" do
    test "loads workflow + ensure_started before validating" do
      result = CLI.run(["validate"], deps_with_capture())

      assert match?({:error, _}, result)
      assert_received :ensure_started_called
      assert_received :load_workflow_called
    end

    test "returns ok when workflow + config validate cleanly" do
      tmp_root = Path.join(System.tmp_dir!(), "cli-validate-#{System.unique_integer([:positive])}")
      File.mkdir_p!(tmp_root)
      issues_dir = Path.join(tmp_root, ".symphony/issues")
      File.mkdir_p!(issues_dir)

      workflow = %{
        config: %{
          "tracker" => %{"kind" => "local_markdown", "issues_root" => issues_dir},
          "agent" => %{"command" => "scripts/bin/llm.sh"},
          "codex" => %{"command" => "codex app-server"},
          "workspace" => %{"root" => tmp_root}
        },
        prompt_template: "{{ issue.title }}",
        source_path: Path.join(tmp_root, "WORKFLOW.md")
      }

      result = CLI.run(["validate"], deps_with_capture({:ok, workflow}))
      assert result == :ok
      assert_received {:stdout, msg}
      assert msg =~ "validate: ok"
    end
  end

  describe "list" do
    test "loads workflow + lists candidate issues" do
      tmp = Path.join(System.tmp_dir!(), "cli-list-#{System.unique_integer([:positive])}")
      issues_dir = Path.join(tmp, "issues")
      File.mkdir_p!(Path.join(issues_dir, "todo"))

      File.write!(Path.join([issues_dir, "todo", "WGTE-001.md"]), """
      ---
      id: WGTE-001
      priority: 1
      ---
      # First task
      """)

      workflow = %{
        config: %{
          "tracker" => %{"kind" => "local_markdown", "issues_root" => issues_dir},
          "agent" => %{"command" => "scripts/bin/llm.sh"},
          "codex" => %{"command" => "codex app-server"},
          "workspace" => %{"root" => tmp}
        },
        prompt_template: "{{ issue.title }}",
        source_path: Path.join(tmp, "WORKFLOW.md")
      }

      assert CLI.run(["list"], deps_with_capture({:ok, workflow})) == :ok

      # Should print at least the issue identifier line.
      assert_received {:stdout, msg}
      assert msg =~ "WGTE-001"
    end
  end

  describe "once --dry-run" do
    test "honors --dry-run + --limit and prints the dispatch plan" do
      tmp = Path.join(System.tmp_dir!(), "cli-once-#{System.unique_integer([:positive])}")
      issues_dir = Path.join(tmp, "issues")
      File.mkdir_p!(Path.join(issues_dir, "todo"))

      File.write!(Path.join([issues_dir, "todo", "WGTE-XYZ.md"]), """
      ---
      id: WGTE-XYZ
      priority: 5
      ---
      # Some task
      """)

      workflow = %{
        config: %{
          "tracker" => %{"kind" => "local_markdown", "issues_root" => issues_dir},
          "agent" => %{"command" => "scripts/bin/llm.sh"},
          "codex" => %{"command" => "codex app-server"},
          "workspace" => %{"root" => tmp}
        },
        prompt_template: "{{ issue.title }}",
        source_path: Path.join(tmp, "WORKFLOW.md")
      }

      result = CLI.run(["once", "--dry-run", "--limit", "1"], deps_with_capture({:ok, workflow}))
      assert result == :ok
      assert_received {:stdout, msg}
      assert msg =~ "would dispatch"
      assert msg =~ "WGTE-XYZ"
    end
  end

  describe "serve" do
    test "sets dashboard config and calls ensure_started + wait_forever" do
      result = CLI.run(["serve", "--port", "0"], deps_with_capture())
      assert result == :ok

      assert Application.get_env(:symphony, :dashboard_enabled?) == true
      assert Application.get_env(:symphony, :dashboard_port) == 0

      assert_received :ensure_started_called
      assert_received {:stdout, msg}
      assert msg =~ "dashboard up on"
      assert_received :wait_forever_called
    end
  end

  describe "unknown subcommand" do
    test "writes an error to stderr and signals failure" do
      result = CLI.run(["bogus-cmd"], deps_with_capture())
      assert {:error, _} = result
      assert_received {:stderr, msg}
      assert msg =~ "unknown subcommand"
    end
  end
end
