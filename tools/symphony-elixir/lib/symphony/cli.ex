defmodule Symphony.CLI do
  @moduledoc """
  Escript entrypoint for Symphony's poll-loop orchestration.

  Subcommands (designed to mirror `scripts/symphony.sh`):

      symphony validate                       — preflight WORKFLOW.md + tracker config
      symphony list                           — list candidate issues from the tracker
      symphony once [--dry-run] [--limit N]   — dispatch one tick
      symphony serve [--port N] [--host H]    — boot the LiveView dashboard

  Top-level flags (must precede the subcommand):

      --workflow PATH       — override WORKFLOW.md path (default: $PWD/WORKFLOW.md)

  Build with `mix escript.build`; the resulting binary is at
  `bin/symphony`.
  """

  alias Symphony.{Config, Tracker, WorkflowLoader}

  @type deps :: %{
          ensure_started: (-> :ok | {:error, term()}),
          load_workflow: (String.t() | nil -> {:ok, WorkflowLoader.workflow()} | {:error, term()}),
          io_puts: (binary() -> :ok),
          io_err: (binary() -> :ok),
          halt: (non_neg_integer() -> no_return()),
          wait_forever: (-> no_return())
        }

  @top_switches [workflow: :string, help: :boolean]
  @top_aliases [h: :help]

  # `--workflow` is also accepted on every subcommand line so users can
  # write either `symphony --workflow X validate` or `symphony validate
  # --workflow X`. Each subcommand strips and applies the override
  # before its own parse.
  @serve_switches [port: :integer, host: :string, workflow: :string]
  @once_switches [dry_run: :boolean, limit: :integer, workflow: :string]
  @validate_switches [workflow: :string]
  @list_switches [workflow: :string]

  @spec main([String.t()]) :: no_return() | :ok
  def main(argv) do
    case run(argv, runtime_deps()) do
      :ok -> :ok
      {:error, msg} -> abort(msg, runtime_deps())
    end
  end

  @doc """
  Pure dispatch core. Accepts the parsed argv and an injected `deps`
  map for testability. Returns `:ok` or `{:error, message}`.
  """
  @spec run([String.t()], deps()) :: :ok | {:error, String.t()}
  def run(argv, deps \\ runtime_deps()) do
    {top_opts, rest} = parse_top_level(argv)

    # Gate the dashboard BEFORE the OTP app starts so non-serve subcommands
    # don't bind port 4040 (STACK-074). `persistent: true` so the put_env
    # survives `:application.start/1`'s env reload on first start.
    configure_dashboard_autostart(rest)

    cond do
      Keyword.get(top_opts, :help, false) ->
        deps.io_puts.(usage())
        :ok

      Keyword.has_key?(top_opts, :workflow) ->
        # Order: put_env BEFORE ensure_started so WorkflowStore picks
        # up the right path at boot. `persistent: true` defeats the
        # `.app` file's env reload (otherwise the boot reload would
        # clobber the put_env). Then `set_path` is a belt-and-suspenders
        # update for the running store's cached path.
        expanded = Path.expand(top_opts[:workflow])
        Application.put_env(:symphony, :workflow_path, expanded, persistent: true)

        case deps.ensure_started.() do
          :ok ->
            :ok = override_workflow_path(top_opts[:workflow])
            dispatch(rest, deps)

          {:error, reason} ->
            {:error, "init failed: #{inspect(reason)}"}
        end

      true ->
        dispatch(rest, deps)
    end
  end

  # Only `serve` needs the Phoenix endpoint. For every other subcommand
  # (validate, list, once, --help) we explicitly disable dashboard auto-
  # start so the app supervision tree skips Phoenix.PubSub + HttpServer
  # entirely. Skipping unknown subcommands too — they error out before
  # touching anything that needs the dashboard.
  defp configure_dashboard_autostart(["serve" | _]), do: :ok

  defp configure_dashboard_autostart(_) do
    Application.put_env(:symphony, :dashboard_autostart?, false, persistent: true)
    :ok
  end

  defp dispatch([], deps) do
    deps.io_puts.(usage())
    :ok
  end

  defp dispatch(["help" | _], deps), do: dispatch(["--help"], deps)

  defp dispatch(["--help" | _], deps) do
    deps.io_puts.(usage())
    :ok
  end

  defp dispatch(["validate" | rest], deps) do
    {opts, _, _} = OptionParser.parse(rest, strict: @validate_switches)
    apply_workflow_override(opts, deps)

    case ensure_workflow_and_started(deps) do
      {:ok, workflow} ->
        case validate_config(workflow) do
          :ok ->
            deps.io_puts.(
              "validate: ok (workflow=#{workflow.source_path || "<inline>"} tracker=#{tracker_kind(workflow)})"
            )

            :ok

          {:error, reason} ->
            {:error, "validate failed: #{inspect(reason)}"}
        end

      {:error, reason} ->
        {:error, "validate failed: #{inspect(reason)}"}
    end
  end

  defp dispatch(["list" | rest], deps) do
    {opts, _, _} = OptionParser.parse(rest, strict: @list_switches)
    apply_workflow_override(opts, deps)

    with {:ok, workflow} <- ensure_workflow_and_started(deps),
         {:ok, config} <- Config.from_workflow(workflow),
         {:ok, adapter} <- Tracker.adapter_for(config),
         {:ok, issues} <- adapter.fetch_candidate_issues(config) do
      lines =
        Enum.map_join(issues, "\n", fn issue ->
          "#{issue.identifier}\tstate=#{issue.state}\tpriority=#{issue.priority || "?"}\t#{issue.title}"
        end)

      deps.io_puts.(if lines == "", do: "(no candidates)", else: lines)
      :ok
    else
      {:error, reason} -> {:error, "list failed: #{inspect(reason)}"}
    end
  end

  defp dispatch(["once" | rest], deps) do
    {opts, _, _} = OptionParser.parse(rest, strict: @once_switches)
    apply_workflow_override(opts, deps)
    dry_run? = Keyword.get(opts, :dry_run, false)
    limit = Keyword.get(opts, :limit, 1)

    with {:ok, workflow} <- ensure_workflow_and_started(deps),
         {:ok, config} <- Config.from_workflow(workflow),
         {:ok, adapter} <- Tracker.adapter_for(config),
         {:ok, issues} <- adapter.fetch_candidate_issues(config) do
      candidates = Enum.take(issues, max(limit, 0))

      Enum.each(candidates, fn issue ->
        prefix = if dry_run?, do: "would dispatch", else: "dispatching"
        deps.io_puts.("#{prefix}: #{issue.identifier} (#{issue.state}) #{issue.title}")
      end)

      if candidates == [] do
        deps.io_puts.("once: no candidates from tracker.kind=#{tracker_kind(workflow)}")
      end

      # In real --no-dry-run mode the orchestrator would already be
      # ticking (via Application start), so we just nudge it. When the
      # orchestrator isn't running (escript invoked outside an
      # already-booted node), we fall back to a single tracker fetch
      # report only.
      if not dry_run? and function_exported?(Symphony.Orchestrator, :tick_now, 0) do
        case Symphony.Orchestrator.tick_now() do
          :ok -> :ok
          _ -> :ok
        end
      end

      :ok
    else
      {:error, reason} -> {:error, "once failed: #{inspect(reason)}"}
    end
  end

  defp dispatch(["serve" | rest], deps) do
    {opts, _, _} = OptionParser.parse(rest, strict: @serve_switches)
    apply_workflow_override(opts, deps)
    port = Keyword.get(opts, :port)
    host = Keyword.get(opts, :host)

    # `persistent: true` so these survive `:application.start/1`'s env
    # reload — same `.app` clobber bug we fix for --workflow PATH.
    if port, do: Application.put_env(:symphony, :dashboard_port, port, persistent: true)
    if host, do: Application.put_env(:symphony, :dashboard_host, host, persistent: true)
    Application.put_env(:symphony, :dashboard_enabled?, true, persistent: true)
    Application.put_env(:symphony, :dashboard_autostart?, true, persistent: true)

    case deps.ensure_started.() do
      :ok ->
        deps.io_puts.(
          "symphony serve: dashboard up on #{host || Application.get_env(:symphony, :dashboard_host, "127.0.0.1")}:#{port || Application.get_env(:symphony, :dashboard_port, 4040)}"
        )

        deps.wait_forever.()

      {:error, reason} ->
        {:error, "serve failed: #{inspect(reason)}"}
    end
  end

  defp dispatch([cmd | _], deps) do
    deps.io_err.("unknown subcommand: #{cmd}\n\n#{usage()}")
    {:error, "unknown subcommand"}
  end

  # ============== Helpers ==============

  defp parse_top_level(argv) do
    {opts, rest, _invalid} =
      OptionParser.parse_head(argv, strict: @top_switches, aliases: @top_aliases)

    {opts, rest}
  end

  # Subcommand-level `--workflow` handler. Order matters: put_env
  # BEFORE ensure_started so WorkflowStore picks up the right path
  # at boot. `persistent: true` defeats the `.app` env reload that
  # would otherwise clobber a non-persistent put_env. After the app
  # is up, `set_path` is a belt-and-suspenders backup that updates
  # the running store's cached path (no-op when the env path was
  # already honored at boot).
  defp apply_workflow_override(opts, deps) do
    case Keyword.get(opts, :workflow) do
      nil ->
        :ok

      path when is_binary(path) ->
        expanded = Path.expand(path)
        Application.put_env(:symphony, :workflow_path, expanded, persistent: true)

        case deps.ensure_started.() do
          :ok -> override_workflow_path(path)
          _ -> :ok
        end
    end
  end

  defp override_workflow_path(path) when is_binary(path) do
    expanded = Path.expand(path)
    Application.put_env(:symphony, :workflow_path, expanded, persistent: true)

    # If the WorkflowStore was already started (it normally is, since the
    # app booted in `run/2` before override), update its cached path so
    # background polling reflects the new file. Tolerate the not-running
    # case (e.g. test envs that disable the store).
    case Process.whereis(Symphony.WorkflowStore) do
      nil -> :ok
      _pid -> Symphony.WorkflowStore.set_path(expanded)
    end

    :ok
  end

  defp override_workflow_path(_), do: :ok

  defp ensure_workflow_and_started(deps) do
    with :ok <- deps.ensure_started.(),
         {:ok, workflow} <- deps.load_workflow.(nil) do
      {:ok, workflow}
    end
  end

  defp validate_config(workflow) do
    case Config.from_workflow(workflow) do
      {:ok, config} -> Config.validate_dispatch_preflight(config)
      other -> {:error, {:from_workflow_unexpected, other}}
    end
  end

  defp tracker_kind(workflow) do
    WorkflowLoader.fetch(workflow, "tracker.kind", "?")
  end

  defp usage do
    """
    Usage: symphony [--workflow PATH] <subcommand> [opts]

    Subcommands:
      validate                  Preflight WORKFLOW.md + tracker config
      list                      List candidate issues from the tracker
      once [--dry-run] [--limit N]
                                Dispatch one tick (limit defaults to 1)
      serve [--port N] [--host H]
                                Boot the LiveView dashboard (spec § 13.3)

    Top-level flags:
      --workflow PATH           Override WORKFLOW.md path
      -h, --help                Show this help

    Examples:
      symphony validate
      symphony list
      symphony once --dry-run --limit 3
      symphony serve --port 4040
    """
  end

  defp abort(message, deps) do
    deps.io_err.(message)
    deps.halt.(1)
  end

  @spec runtime_deps() :: deps()
  defp runtime_deps do
    %{
      ensure_started: fn -> ensure_started_runtime() end,
      load_workflow: &WorkflowLoader.load/1,
      io_puts: &IO.puts/1,
      io_err: fn msg -> IO.puts(:stderr, msg) end,
      halt: &System.halt/1,
      wait_forever: &wait_forever/0
    }
  end

  defp ensure_started_runtime do
    case Application.ensure_all_started(:symphony) do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp wait_forever do
    case Process.whereis(Symphony.Supervisor) do
      nil ->
        IO.puts(:stderr, "Symphony.Supervisor is not running")
        System.halt(1)

      pid ->
        ref = Process.monitor(pid)

        receive do
          {:DOWN, ^ref, :process, ^pid, reason} ->
            case reason do
              :normal -> System.halt(0)
              _ -> System.halt(1)
            end
        end
    end
  end
end
