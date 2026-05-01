# Boot helper: ensures the application is started with a multi sink that
# fans out to both stderr (so operators see live logs) and a JSONL file
# under .symphony/logs/ (so Vector tails it into VictoriaLogs).
#
# Usage:
#   SYMPHONY_WORKFLOW_FILE=/abs/path/WORKFLOW.md \
#   SYMPHONY_LOG_FILE=/abs/path/.symphony/logs/symphony-elixir.jsonl \
#   SYMPHONY_REPO_ROOT=/abs/path/to/repo \
#   mix run --no-halt scripts/boot_with_file_sink.exs
#
# Set SYMPHONY_REPO_ROOT to make the orchestrator resolve relative paths
# in WORKFLOW.md (`tracker.issues_root`, `workspace.root`, `log_path`)
# against the repo root rather than the Elixir project's mix.exs dir.

repo_root =
  System.get_env("SYMPHONY_REPO_ROOT") ||
    case System.get_env("SYMPHONY_WORKFLOW_FILE") do
      nil -> File.cwd!()
      wf -> Path.dirname(wf)
    end

if repo_root != File.cwd!() do
  File.cd!(repo_root)
  IO.puts(:standard_error, "boot_with_file_sink: cwd=#{repo_root}")
end

log_file =
  System.get_env("SYMPHONY_LOG_FILE") ||
    Path.join([File.cwd!(), ".symphony", "logs", "symphony-elixir.jsonl"])

File.mkdir_p!(Path.dirname(log_file))

# The orchestrator was started by Symphony.Application before this script
# ran, with whatever cwd `mix run` had at boot. If we just changed cwd,
# reload the workflow so Config.from_workflow re-runs against the new
# working directory and the local_markdown adapter can find issues_root.
case Symphony.reload_workflow() do
  :ok ->
    IO.puts(:standard_error, "boot_with_file_sink: workflow reloaded after cd")

  {:error, reason} ->
    IO.puts(:standard_error, "boot_with_file_sink: reload failed reason=#{inspect(reason)}")
end

# Reconfigure the running sink to fan out to both stderr and the file.
:ok = Symphony.Logging.Sink.configure({:multi, [:stderr, {:file, log_file}]})

# Tick once now so the dispatch event lands quickly without waiting for
# the polling interval. Best-effort; if the orchestrator is not running
# (e.g. auto_start_orchestrator? is false) we just log and continue.
case Symphony.Orchestrator.tick_now() do
  :ok ->
    IO.puts(:standard_error, "boot_with_file_sink: forced one tick, log_file=#{log_file}")

  {:error, reason} ->
    IO.puts(
      :standard_error,
      "boot_with_file_sink: tick_now failed reason=#{inspect(reason)}, log_file=#{log_file}"
    )
end
