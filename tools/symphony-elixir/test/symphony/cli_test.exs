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
      tmp_root =
        Path.join(System.tmp_dir!(), "cli-validate-#{System.unique_integer([:positive])}")

      File.mkdir_p!(tmp_root)
      issues_dir = Path.join(tmp_root, ".symphony/issues")
      File.mkdir_p!(issues_dir)

      workflow = %{
        config: %{
          "tracker" => %{"kind" => "local_markdown", "issues_root" => issues_dir, "active_states" => ["todo", "in_progress"]},
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
          "tracker" => %{"kind" => "local_markdown", "issues_root" => issues_dir, "active_states" => ["todo", "in_progress"]},
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
          "tracker" => %{"kind" => "local_markdown", "issues_root" => issues_dir, "active_states" => ["todo", "in_progress"]},
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

  describe "dashboard autostart gating (STACK-074)" do
    # Regression: every escript subcommand booted Phoenix on port 4040
    # because the dashboard children were always in the supervision tree.
    # The fix gates them on `:dashboard_autostart?`, which CLI.run sets to
    # `false` BEFORE app start for non-serve subcommands so port 4040
    # never gets bound. `serve` leaves the default in place so the
    # dashboard still boots when the operator actually asks for it.

    setup do
      saved = Application.get_env(:symphony, :dashboard_autostart?)

      on_exit(fn ->
        if is_nil(saved) do
          Application.delete_env(:symphony, :dashboard_autostart?)
        else
          Application.put_env(:symphony, :dashboard_autostart?, saved)
        end
      end)

      Application.delete_env(:symphony, :dashboard_autostart?)
      :ok
    end

    test "validate disables dashboard autostart" do
      CLI.run(["validate"], deps_with_capture())
      assert Application.get_env(:symphony, :dashboard_autostart?) == false
    end

    test "list disables dashboard autostart" do
      CLI.run(["list"], deps_with_capture())
      assert Application.get_env(:symphony, :dashboard_autostart?) == false
    end

    test "once disables dashboard autostart" do
      CLI.run(["once", "--dry-run"], deps_with_capture())
      assert Application.get_env(:symphony, :dashboard_autostart?) == false
    end

    test "serve preserves the default (does not force autostart off)" do
      CLI.run(["serve", "--port", "0"], deps_with_capture())
      # serve explicitly sets autostart? = true (so an operator who set
      # dashboard_enabled? = false in config still gets the dashboard
      # when they ask for it via `serve`).
      assert Application.get_env(:symphony, :dashboard_autostart?) == true
    end

    test "no subcommand still disables (help fallback path doesn't need dashboard)" do
      CLI.run([], deps_with_capture())
      assert Application.get_env(:symphony, :dashboard_autostart?) == false
    end
  end

  describe "--workflow PATH (STACK-073)" do
    # Regression: the flag was silently ignored because the escript boots
    # the OTP app before CLI.main runs, and `:application.start/1` reloads
    # the .app's compile-time env on first start — which clobbered the
    # `Application.put_env` call that override_workflow_path made *before*
    # ensure_started. The fix reorders ensure_started to run before
    # override AND adds `WorkflowStore.set_path/1` so the running store's
    # cached path also updates.

    test "puts the user-supplied path into Application env (overriding default)" do
      saved = Application.get_env(:symphony, :workflow_path)

      on_exit(fn ->
        if is_nil(saved) do
          Application.delete_env(:symphony, :workflow_path)
        else
          Application.put_env(:symphony, :workflow_path, saved)
        end
      end)

      tmp_dir =
        Path.join(System.tmp_dir!(), "cli-flag-#{System.unique_integer([:positive])}")

      File.mkdir_p!(tmp_dir)
      File.mkdir_p!(Path.join(tmp_dir, "issues"))
      workflow_file = Path.join(tmp_dir, "WORKFLOW.md")
      File.write!(workflow_file, "---\ntracker:\n  kind: local_markdown\n---\n")

      workflow = %{
        config: %{
          "tracker" => %{
            "kind" => "local_markdown",
            "issues_root" => Path.join(tmp_dir, "issues")
          },
          "agent" => %{"command" => "scripts/bin/llm.sh"},
          "codex" => %{"command" => "codex app-server"},
          "workspace" => %{"root" => tmp_dir}
        },
        prompt_template: "{{ issue.title }}",
        source_path: workflow_file
      }

      result =
        CLI.run(["--workflow", workflow_file, "validate"], deps_with_capture({:ok, workflow}))

      assert result == :ok
      assert Application.get_env(:symphony, :workflow_path) == Path.expand(workflow_file)
    end

    test "error path on a bogus --workflow value matches the user-supplied path, not the default" do
      saved = Application.get_env(:symphony, :workflow_path)

      on_exit(fn ->
        if is_nil(saved) do
          Application.delete_env(:symphony, :workflow_path)
        else
          Application.put_env(:symphony, :workflow_path, saved)
        end
      end)

      bogus =
        Path.join(System.tmp_dir!(), "cli-flag-bogus-#{System.unique_integer([:positive])}.md")

      refute File.exists?(bogus)

      deps = %{
        ensure_started: fn -> :ok end,
        load_workflow: &Symphony.WorkflowLoader.load/1,
        io_puts: fn _ -> :ok end,
        io_err: fn _ -> :ok end,
        halt: fn _ -> :ok end,
        wait_forever: fn -> :ok end
      }

      assert {:error, msg} = CLI.run(["--workflow", bogus, "validate"], deps)
      assert msg =~ bogus
      refute msg =~ "tools/symphony-elixir/WORKFLOW.md"
    end
  end
end
