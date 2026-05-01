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
       all other characters collapse to `_`.

  Hooks (section 9.4):

    * `after_create`  — fatal failure on non-zero exit
    * `before_run`    — fatal failure on non-zero exit
    * `after_run`     — failure logged but ignored
    * `before_remove` — failure logged but ignored

  All hook executions respect `hooks.timeout_ms` from the typed config.
  """

  alias Symphony.Config

  require Logger

  @type workspace :: %{
          required(:path) => binary(),
          required(:workspace_key) => binary(),
          required(:created_now) => boolean()
        }

  # ============== Public API ==============

  @doc """
  Sanitize an issue identifier into a workspace key.

  Replaces any character outside `[A-Za-z0-9._-]` with `_`, collapses
  consecutive underscores, and trims leading/trailing underscores.
  """
  @spec sanitize_key(binary()) :: binary()
  def sanitize_key(identifier) when is_binary(identifier) do
    identifier
    |> String.replace(~r/[^A-Za-z0-9._-]+/, "_")
    |> String.trim("_")
  end

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
  Raises `RuntimeError` on mismatch — section 9.5 invariant 1.
  """
  @spec assert_safe_cwd!(workspace(), binary()) :: :ok
  def assert_safe_cwd!(%{path: ws_path}, cwd) do
    if absolute(ws_path) == absolute(cwd) do
      :ok
    else
      raise "symphony.workspace.invariant_violation cwd=#{cwd} workspace=#{ws_path}"
    end
  end

  @doc """
  Assert that `path` is inside `root` after absolute-path normalization.
  Raises `RuntimeError` on escape — section 9.5 invariant 2.
  """
  @spec assert_inside_root!(binary(), binary()) :: :ok
  def assert_inside_root!(root, path) do
    abs_root = absolute(root)
    abs_path = absolute(path)

    cond do
      abs_path == abs_root ->
        :ok

      String.starts_with?(abs_path, abs_root <> "/") ->
        :ok

      true ->
        raise "symphony.workspace.escape root=#{abs_root} path=#{abs_path}"
    end
  end

  @doc """
  Run a workspace hook by name. Returns `:ok` on success or `{:error,
  reason}`. The caller decides whether the failure is fatal — per spec:
  `after_create` and `before_run` are fatal; `after_run` and
  `before_remove` are logged-and-ignored.
  """
  @spec run_hook(Config.t(), workspace(), :after_create | :before_run | :after_run | :before_remove) ::
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

  # ============== Helpers ==============

  defp run_script(script, cwd, timeout_ms, name) do
    task =
      Task.async(fn ->
        try do
          {output, status} =
            System.cmd("bash", ["-lc", script],
              cd: cwd,
              stderr_to_stdout: true
            )

          {status, output}
        rescue
          e -> {:exception, Exception.message(e)}
        end
      end)

    case Task.yield(task, timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, {0, _output}} ->
        Logger.info("symphony.hook.#{name} outcome=success cwd=#{cwd}")
        :ok

      {:ok, {status, output}} when is_integer(status) ->
        Logger.warning("symphony.hook.#{name} outcome=failure exit=#{status} cwd=#{cwd}")
        Logger.debug("symphony.hook.#{name}.output #{output}")
        {:error, {:hook_nonzero_exit, status}}

      {:ok, {:exception, msg}} ->
        Logger.warning("symphony.hook.#{name} outcome=exception cwd=#{cwd} message=#{msg}")
        {:error, {:hook_exception, msg}}

      nil ->
        Logger.warning("symphony.hook.#{name} outcome=timeout timeout_ms=#{timeout_ms} cwd=#{cwd}")
        {:error, :hook_timeout}

      other ->
        Logger.warning("symphony.hook.#{name} outcome=unknown #{inspect(other)}")
        {:error, {:hook_unknown, other}}
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
