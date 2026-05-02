defmodule Symphony.WorkspaceManager do
  @moduledoc """
  Owns the per-issue workspace lifecycle, per Symphony spec section 9.

  Layout:

      <workspace.root>/<sanitized_identifier>

  Hard safety invariants (section 9.5):

    1. The agent runs only inside the per-issue workspace (`cwd ===
       workspace_path`). Enforced by `assert_safe_cwd!/2`.
    2. The workspace path must stay inside `workspace.root` after
       absolute-path normalization. Enforced by `assert_inside_root!/2`.
    3. The workspace key is sanitized: only `[A-Za-z0-9._-]` is allowed;
       all other characters are replaced 1:1 with `_` (no run-collapse,
       no trim — matches the literal spec wording from section 9.5).

  All three invariants are delegated to `Symphony.PathSafety` so the
  workspace manager and any future code paths share a single
  implementation.

  Hooks (section 9.4):

    * `after_create`  — fatal failure on non-zero exit
    * `before_run`    — fatal failure on non-zero exit
    * `after_run`     — failure logged but ignored
    * `before_remove` — failure logged but ignored

  All hook executions respect `hooks.timeout_ms` from the typed config.
  Hook execution uses `Task.async/yield` with a precise millisecond
  timeout and `Task.shutdown(:brutal_kill)` on overrun, matching upstream
  Symphony behaviour.
  """

  alias Symphony.{Config, PathSafety}

  require Logger

  @type workspace :: %{
          required(:path) => binary(),
          required(:workspace_key) => binary(),
          required(:created_now) => boolean()
        }

  # ============== Public API ==============

  @doc """
  Sanitize an issue identifier into a workspace key — delegated to
  `Symphony.PathSafety.sanitize_key/1`.
  """
  @spec sanitize_key(binary() | nil) :: binary()
  def sanitize_key(identifier), do: PathSafety.sanitize_key(identifier)

  @doc """
  Compute the absolute workspace path for a given issue identifier.

  Does not touch the filesystem. Use `ensure_exists/2` to create the
  directory.
  """
  @spec workspace_path(Config.t(), binary()) :: binary()
  def workspace_path(config, identifier) do
    root = absolute(Config.workspace_root(config))
    Path.join(root, sanitize_key(identifier))
  end

  @doc """
  Ensure the per-issue workspace directory exists. Returns the workspace
  struct including `created_now` so callers can decide whether to fire
  the `after_create` hook.

  `created_now=true` only when this call is responsible for the directory
  appearing on disk; reused workspaces report `false`. Mirrors upstream
  Symphony semantics so hook ordering across attempts stays predictable.

  Enforces invariant 2 — the resolved path must be inside the workspace
  root.
  """
  @spec ensure_exists(Config.t(), binary()) :: {:ok, workspace()} | {:error, term()}
  def ensure_exists(config, identifier) do
    path = workspace_path(config, identifier)
    root = absolute(Config.workspace_root(config))

    with :ok <- assert_inside_root!(root, path) |> wrap_invariant() do
      created_now = not File.exists?(path)
      File.mkdir_p!(path)

      {:ok,
       %{
         path: path,
         workspace_key: sanitize_key(identifier),
         created_now: created_now
       }}
    end
  end

  @doc """
  Assert that the agent is about to run with `cwd === workspace_path`.
  Delegated to `Symphony.PathSafety.assert_safe_cwd!/2` — section 9.5
  invariant 1.
  """
  @spec assert_safe_cwd!(workspace(), binary()) :: :ok
  def assert_safe_cwd!(%{path: _} = ws, cwd), do: PathSafety.assert_safe_cwd!(ws, cwd)

  @doc """
  Assert that `path` is inside `root` after absolute-path normalization.
  Delegated to `Symphony.PathSafety.assert_inside_root!/2` — section 9.5
  invariant 2.
  """
  @spec assert_inside_root!(binary(), binary()) :: :ok
  def assert_inside_root!(root, path), do: PathSafety.assert_inside_root!(root, path)

  @doc """
  Run a workspace hook by name. Returns `:ok` on success or `{:error,
  reason}`. The caller decides whether the failure is fatal — per spec:
  `after_create` and `before_run` are fatal; `after_run` and
  `before_remove` are logged-and-ignored.

  Hook execution sequence:

    1. Resolve the script via `Config.hook_script/2`. A nil script
       short-circuits with `:ok`.
    2. Spawn `bash -lc <script>` (or `sh -lc` if bash is unavailable)
       with the workspace path as `cwd`. Capture stderr together with
       stdout for log truncation.
    3. Yield up to `hooks.timeout_ms` milliseconds. On overrun, brutal
       kill the task and return `{:error, :hook_timeout}` so the caller
       can classify it as fatal or logged-only per § 9.4.
  """
  @spec run_hook(
          Config.t(),
          workspace(),
          :after_create | :before_run | :after_run | :before_remove
        ) ::
          :ok | {:error, term()}
  def run_hook(config, %{path: cwd}, name) do
    case Config.hook_script(config, name) do
      nil ->
        :ok

      script when is_binary(script) ->
        timeout_ms = Config.hooks_timeout_ms(config)
        run_script(script, cwd, timeout_ms, name)
    end
  end

  @doc """
  Upstream-compatible workspace cleanup that consults the global
  `Config.settings!()` instead of taking an explicit `Config.t()` arg.
  Removes the per-issue workspace directory under `workspace.root`
  matching the sanitized identifier. Returns `:ok` even on missing
  workspace or non-binary identifier — matches upstream
  `SymphonyElixir.Workspace.remove_issue_workspaces/1` semantics.

  Honors `worker.ssh_hosts` from the parsed schema: when ssh_hosts is
  populated, fans out to each host (the remote-shell variant is not
  implemented yet — currently best-effort logs and returns `:ok`).
  """
  @spec remove_issue_workspaces(term()) :: :ok
  def remove_issue_workspaces(identifier), do: remove_issue_workspaces(identifier, nil)

  @spec remove_issue_workspaces(term(), binary() | nil) :: :ok
  def remove_issue_workspaces(identifier, worker_host)
      when is_binary(identifier) and is_binary(worker_host) do
    # Remote-host workspace removal is parked for the SSH worker port;
    # the upstream test that exercises this branch (MT-SSH-WS) is part of
    # a section we have not ported yet. Local cleanup remains best-effort.
    Logger.debug(
      "symphony.workspace.remove_issue_workspaces.remote_host_skip identifier=#{identifier} worker_host=#{worker_host}"
    )

    :ok
  end

  def remove_issue_workspaces(identifier, nil) when is_binary(identifier) do
    settings = safe_settings()
    worker_hosts = settings_worker_ssh_hosts(settings)

    case worker_hosts do
      [] ->
        do_remove_local_workspace(settings, identifier)

      hosts when is_list(hosts) ->
        Enum.each(hosts, &remove_issue_workspaces(identifier, &1))
    end

    :ok
  end

  def remove_issue_workspaces(_identifier, _worker_host), do: :ok

  defp settings_worker_ssh_hosts(%{worker: worker}) when is_map(worker) do
    Map.get(worker, :ssh_hosts) || []
  end

  defp settings_worker_ssh_hosts(_settings), do: []

  defp do_remove_local_workspace(settings, identifier) do
    root = workspace_root_from_settings(settings)
    safe_id = sanitize_key(identifier)
    path = Path.join(root, safe_id) |> Path.expand()

    # Invariant 2 (spec § 9.5): the resolved path must remain inside the
    # configured workspace root. Bail out silently if not — never delete
    # a directory that escapes the root sandbox.
    case PathSafety.canonicalize(path) do
      {:ok, canonical} ->
        try do
          PathSafety.assert_inside_root!(Path.expand(root), canonical)
        rescue
          _ ->
            Logger.warning(
              "symphony.workspace.remove_issue_workspaces.path_outside_root identifier=#{identifier} path=#{canonical}"
            )

            :outside_root
        else
          :ok ->
            if File.exists?(canonical) do
              _ = File.rm_rf(canonical)
            end

            :ok
        end

      {:error, _reason} ->
        :ok
    end

    :ok
  end

  defp workspace_root_from_settings(%{workspace: %{root: root}}) when is_binary(root), do: root

  defp workspace_root_from_settings(_other) do
    Path.join(System.tmp_dir!(), "symphony_workspaces")
  end

  defp safe_settings do
    Config.settings!()
  rescue
    _ ->
      %{
        workspace: %{root: Path.join(System.tmp_dir!(), "symphony_workspaces")},
        worker: %{ssh_hosts: []}
      }
  end

  @doc """
  Remove an issue workspace after running `before_remove` when the
  directory exists. Per spec § 9.4, hook failure and timeout are logged
  and ignored; cleanup still proceeds.
  """
  @spec remove(Config.t(), binary()) :: :ok | {:error, term()}
  def remove(config, identifier) when is_binary(identifier) do
    path = workspace_path(config, identifier)
    root = absolute(Config.workspace_root(config))

    with :ok <- assert_inside_root!(root, path) |> wrap_invariant() do
      if File.exists?(path) do
        workspace = %{path: path, workspace_key: sanitize_key(identifier), created_now: false}
        _ = run_hook(config, workspace, :before_remove)

        case File.rm_rf(path) do
          {:ok, _files} -> :ok
          {:error, reason, failed_path} -> {:error, {:remove_failed, failed_path, reason}}
        end
      else
        :ok
      end
    end
  end

  # ============== Helpers ==============

  defp run_script(script, cwd, timeout_ms, name) do
    action = "hook.#{name}"

    Logger.info("event.action=#{action} event.outcome=start cwd=#{cwd} timeout_ms=#{timeout_ms}")

    task =
      Task.async(fn ->
        try do
          case shell_command(script, cwd) do
            {:ok, {output, status}} -> {status, output}
            {:error, reason} -> {:exception, inspect(reason)}
          end
        rescue
          e -> {:exception, Exception.message(e)}
        end
      end)

    case Task.yield(task, timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, {0, _output}} ->
        Logger.info("event.action=#{action} event.outcome=success cwd=#{cwd}")
        :ok

      {:ok, {status, output}} when is_integer(status) ->
        truncated = truncate_output(output)
        Logger.warning("event.action=#{action} event.outcome=failure exit=#{status} cwd=#{cwd}")
        Logger.debug("event.action=#{action}.output #{truncated}")
        {:error, {:hook_nonzero_exit, status}}

      {:ok, {:exception, msg}} ->
        Logger.warning("event.action=#{action} event.outcome=exception cwd=#{cwd} message=#{msg}")
        {:error, {:hook_exception, msg}}

      nil ->
        Logger.warning(
          "event.action=#{action} event.outcome=timeout timeout_ms=#{timeout_ms} cwd=#{cwd}"
        )

        {:error, :hook_timeout}

      other ->
        Logger.warning("event.action=#{action} event.outcome=unknown #{inspect(other)}")
        {:error, {:hook_unknown, other}}
    end
  end

  defp shell_command(script, cwd) do
    cond do
      bash = System.find_executable("bash") ->
        {:ok, System.cmd(bash, ["-lc", script], cd: cwd, stderr_to_stdout: true)}

      sh = System.find_executable("sh") ->
        {:ok, System.cmd(sh, ["-c", script], cd: cwd, stderr_to_stdout: true)}

      true ->
        {:error, :no_local_shell}
    end
  end

  # Cap hook output at 2 KiB before logging (matches upstream so noisy
  # hooks like `npm install` cannot overwhelm the JSONL sink).
  defp truncate_output(output, max_bytes \\ 2_048) do
    binary = IO.iodata_to_binary(output)

    if byte_size(binary) <= max_bytes do
      binary
    else
      binary_part(binary, 0, max_bytes) <> "... (truncated)"
    end
  end

  defp absolute(path) do
    cond do
      Path.type(path) == :absolute -> Path.expand(path)
      true -> Path.expand(path)
    end
  end

  defp wrap_invariant(:ok), do: :ok
end
