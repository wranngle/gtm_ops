defmodule Symphony.Config do
  @moduledoc """
  Typed view of the workflow configuration, per Symphony spec section 5.3 + 6.

  Responsibilities:
    1. Apply built-in defaults to every field declared in the spec.
    2. Resolve `$VAR_NAME` indirection in selected string fields against the
       process environment.
    3. Provide typed getters so callers do not pattern-match raw maps.

  Construction:

      iex> {:ok, workflow} = Symphony.WorkflowLoader.load(path)
      iex> {:ok, config} = Symphony.Config.from_workflow(workflow)
      iex> Symphony.Config.tracker_kind(config)
      :local_markdown

  Validation errors are returned as `{:error, {:invalid, field, reason}}`
  rather than raised, so the orchestrator can decide whether to fail
  startup or skip a tick.
  """

  alias Symphony.Config.Schema
  alias Symphony.Workflow
  alias Symphony.WorkflowLoader

  @default_observability_settings %{
    refresh_ms: 1_000,
    render_interval_ms: 1_000,
    dashboard_enabled: false
  }

  @default_server_settings %{
    host: "127.0.0.1",
    port: nil
  }

  @default_agent_settings %{
    max_concurrent_agents: 10,
    max_concurrent_agents_by_state: %{}
  }

  @default_tracker_settings %{
    project_slug: nil,
    kind: "local_markdown"
  }

  @doc """
  Upstream-compatible accessor for `Symphony.StatusDashboard` and other
  ported modules that expect `Config.settings!()` to return a typed
  struct with nested fields (`tracker`, `polling`, `workspace`, `hooks`,
  `agent`, `codex`, `server`, `observability`).

  Tries `Symphony.Workflow.current/0` first (mirrors upstream); on
  failure returns sensible defaults so the dashboard formatter can be
  exercised in isolation (e.g. `StatusDashboardSnapshotTest`) without
  a workflow file on disk.
  """
  @spec settings!() :: map() | Schema.t()
  def settings! do
    case maybe_settings() do
      {:ok, settings} ->
        settings

      :default ->
        %{
          tracker: @default_tracker_settings,
          server: @default_server_settings,
          agent: @default_agent_settings,
          observability: @default_observability_settings,
          polling: %{interval_ms: 30_000}
        }
    end
  end

  @spec server_port() :: non_neg_integer() | nil
  def server_port do
    case Application.get_env(:symphony, :server_port_override) do
      port when is_integer(port) and port >= 0 ->
        port

      _ ->
        case settings!() do
          %{server: %{port: port}} -> port
          _ -> nil
        end
    end
  end

  defp maybe_settings do
    if function_exported?(Workflow, :current, 0) do
      case Workflow.current() do
        {:ok, %{config: config}} when is_map(config) ->
          case Schema.parse(config) do
            {:ok, parsed} -> {:ok, parsed}
            _ -> :default
          end

        _ ->
          :default
      end
    else
      :default
    end
  rescue
    _ -> :default
  end

  @env_resolvable [
    "tracker.endpoint",
    "tracker.api_key",
    "tracker.project_slug",
    "tracker.repo",
    "workspace.root",
    "agent.command",
    "codex.command",
    "log_path"
  ]

  # Spec § 6.1 / § 9.1: filesystem path values may be expressed as
  # repo-relative strings inside WORKFLOW.md. Resolve them against the
  # directory containing the workflow file so the daemon doesn't depend
  # on whatever cwd `mix run` happened to inherit (the previous behavior
  # silently broke `tracker.issues_root: .symphony/issues` when started
  # from `tools/symphony-elixir/`).
  @path_resolvable [
    "tracker.issues_root",
    "workspace.root",
    "log_path"
  ]

  @defaults %{
    "tracker.kind" => "local_markdown",
    "tracker.endpoint" => "https://api.linear.app/graphql",
    "tracker.api_key" => nil,
    "tracker.project_slug" => nil,
    "tracker.repo" => nil,
    "tracker.issues_root" => ".symphony/issues",
    "tracker.active_states" => "todo,in_progress",
    "tracker.terminal_states" => "done,cancelled,duplicate",
    "tracker.handoff_state" => "human_review",
    "polling.interval_ms" => 30_000,
    "workspace.root" => System.tmp_dir!() <> "/symphony_workspaces",
    "hooks.timeout_ms" => 60_000,
    "agent.command" => "codex app-server",
    "agent.max_concurrent_agents" => 10,
    "agent.max_retry_backoff_ms" => 300_000,
    "agent.require_explicit_run" => false,
    "codex.command" => "codex app-server",
    "codex.read_timeout_ms" => 5_000,
    "codex.turn_timeout_ms" => 3_600_000,
    "codex.stall_timeout_ms" => 300_000,
    "log_path" => ".symphony/logs/symphony.jsonl"
  }

  @type t :: %{
          required(:raw) => map(),
          required(:resolved) => map(),
          required(:source_path) => binary()
        }

  @spec from_workflow(WorkflowLoader.workflow()) :: {:ok, t()} | {:error, term()}
  def from_workflow(%{config: raw, source_path: path}) do
    workflow_dir = path && Path.dirname(path)

    resolved =
      Enum.reduce(@defaults, %{}, fn {dotted, default}, acc ->
        value =
          case fetch_raw(raw, dotted) do
            :missing -> default
            {:ok, v} -> v
          end

        value
        |> maybe_resolve_env(dotted)
        |> maybe_resolve_path(dotted, workflow_dir)
        |> then(&Map.put(acc, dotted, &1))
      end)

    {:ok, %{raw: raw, resolved: resolved, source_path: path}}
  end

  # ============== Typed getters ==============

  @spec tracker_kind(t()) :: :local_markdown | :github_issues | :linear | atom()
  def tracker_kind(config) do
    config.resolved
    |> Map.fetch!("tracker.kind")
    |> to_string()
    |> String.to_atom()
  end

  @spec tracker_repo(t()) :: binary() | nil
  def tracker_repo(config), do: get_string(config, "tracker.repo")

  @spec tracker_endpoint(t()) :: binary()
  def tracker_endpoint(config), do: get_string!(config, "tracker.endpoint")

  @spec tracker_api_key(t()) :: binary() | nil
  def tracker_api_key(config) do
    case get_string(config, "tracker.api_key") do
      "" -> nil
      v -> v
    end
  end

  @spec tracker_active_states(t()) :: [binary()]
  def tracker_active_states(config), do: csv(config, "tracker.active_states")

  @spec tracker_terminal_states(t()) :: [binary()]
  def tracker_terminal_states(config), do: csv(config, "tracker.terminal_states")

  @spec polling_interval_ms(t()) :: pos_integer()
  def polling_interval_ms(config), do: pos_int!(config, "polling.interval_ms")

  @spec workspace_root(t()) :: binary()
  def workspace_root(config), do: get_string!(config, "workspace.root")

  @spec hooks_timeout_ms(t()) :: pos_integer()
  def hooks_timeout_ms(config), do: pos_int_or_default(config, "hooks.timeout_ms", 60_000)

  @spec hook_script(t(), :after_create | :before_run | :after_run | :before_remove) ::
          binary() | nil
  def hook_script(config, name) do
    case fetch_raw(config.raw, "hooks." <> Atom.to_string(name)) do
      {:ok, v} when is_binary(v) and v != "" -> v
      _ -> nil
    end
  end

  @spec agent_command(t()) :: binary()
  def agent_command(config), do: get_string!(config, "agent.command")

  @spec agent_max_concurrent_agents(t()) :: pos_integer()
  def agent_max_concurrent_agents(config),
    do: pos_int!(config, "agent.max_concurrent_agents")

  @spec agent_max_retry_backoff_ms(t()) :: pos_integer()
  def agent_max_retry_backoff_ms(config),
    do: pos_int!(config, "agent.max_retry_backoff_ms")

  @spec agent_require_explicit_run?(t()) :: boolean()
  def agent_require_explicit_run?(config) do
    case Map.fetch!(config.resolved, "agent.require_explicit_run") do
      true -> true
      "true" -> true
      _ -> false
    end
  end

  @spec codex_command(t()) :: binary()
  def codex_command(config), do: get_string!(config, "codex.command")

  @spec log_path(t()) :: binary()
  def log_path(config), do: get_string!(config, "log_path")

  @doc """
  Spec § 6.3 dispatch preflight: validate the minimal config the
  scheduler needs before launching work this tick. Returns `:ok` or
  `{:error, {:dispatch_preflight, [reason, ...]}}` so the orchestrator
  can skip dispatch (but keep reconciliation running) and emit an
  operator-visible warning.

  Checks performed:

    * `tracker.kind` is present and supported (delegated to the tracker
      adapter resolver elsewhere; this layer just rejects empty values).
    * `tracker.api_key` is present after `$VAR` resolution when the
      tracker requires it (`linear`, `github_issues`).
    * `tracker.project_slug` is present when `tracker.kind == :linear`.
    * `tracker.repo` is present when `tracker.kind == :github_issues`.
    * `codex.command` is non-empty (or `agent.command` for kits that
      stand in for codex).
  """
  @spec validate_dispatch_preflight(t()) :: :ok | {:error, {:dispatch_preflight, [atom()]}}
  def validate_dispatch_preflight(config) do
    kind = tracker_kind(config)
    reasons = []

    reasons =
      case kind do
        :linear ->
          reasons
          |> add_if_missing(tracker_api_key(config), :missing_tracker_api_key)
          |> add_if_missing(
            get_string(config, "tracker.project_slug"),
            :missing_tracker_project_slug
          )

        :github_issues ->
          add_if_missing(reasons, get_string(config, "tracker.repo"), :missing_tracker_repo)

        _ ->
          reasons
      end

    reasons =
      reasons
      |> add_if_missing(safe_get_string(config, "codex.command"), :missing_codex_command)
      |> add_if_missing(safe_get_string(config, "agent.command"), :missing_agent_command)

    case reasons do
      [] -> :ok
      list -> {:error, {:dispatch_preflight, Enum.reverse(list)}}
    end
  end

  defp add_if_missing(reasons, nil, atom), do: [atom | reasons]
  defp add_if_missing(reasons, "", atom), do: [atom | reasons]
  defp add_if_missing(reasons, _value, _atom), do: reasons

  defp safe_get_string(config, dotted) do
    get_string(config, dotted)
  rescue
    _ -> nil
  end

  # ============== Helpers ==============

  defp fetch_raw(map, dotted) do
    case do_fetch(map, String.split(dotted, ".")) do
      {:ok, v} -> {:ok, v}
      :missing -> :missing
    end
  end

  defp do_fetch(value, []), do: {:ok, value}

  defp do_fetch(map, [key | rest]) when is_map(map) do
    case Map.fetch(map, key) do
      {:ok, v} -> do_fetch(v, rest)
      :error -> :missing
    end
  end

  defp do_fetch(_, _), do: :missing

  defp maybe_resolve_env(value, dotted) when is_binary(value) do
    if dotted in @env_resolvable do
      resolve_env(value)
    else
      value
    end
  end

  defp maybe_resolve_env(value, _dotted), do: value

  defp resolve_env("$" <> var_name) do
    System.get_env(var_name) || ""
  end

  defp resolve_env(value), do: value

  # Promote a relative filesystem path to absolute by resolving it against
  # the directory of WORKFLOW.md. Absolute paths and non-binary values pass
  # through unchanged. URLs and arbitrary command strings are not in
  # `@path_resolvable` and are skipped.
  defp maybe_resolve_path(value, dotted, workflow_dir)
       when is_binary(value) and is_binary(workflow_dir) do
    if dotted in @path_resolvable do
      resolve_path(value, workflow_dir)
    else
      value
    end
  end

  defp maybe_resolve_path(value, _dotted, _workflow_dir), do: value

  defp resolve_path("", _workflow_dir), do: ""

  defp resolve_path(<<"~", _::binary>> = path, _workflow_dir), do: Path.expand(path)

  defp resolve_path(<<"$", _::binary>> = path, _workflow_dir),
    do: path

  defp resolve_path(path, workflow_dir) do
    case Path.type(path) do
      :absolute -> Path.expand(path)
      _ -> Path.expand(path, workflow_dir)
    end
  end

  defp get_string(config, dotted) do
    case Map.fetch!(config.resolved, dotted) do
      v when is_binary(v) -> v
      nil -> nil
      v -> to_string(v)
    end
  end

  defp get_string!(config, dotted) do
    case get_string(config, dotted) do
      v when is_binary(v) and v != "" -> v
      _ -> raise ArgumentError, "config: #{dotted} must be a non-empty string"
    end
  end

  defp pos_int!(config, dotted) do
    case Map.fetch!(config.resolved, dotted) do
      v when is_integer(v) and v > 0 ->
        v

      v when is_binary(v) ->
        case Integer.parse(v) do
          {n, ""} when n > 0 -> n
          _ -> raise ArgumentError, "config: #{dotted} not a positive integer (#{inspect(v)})"
        end

      v ->
        raise ArgumentError, "config: #{dotted} not a positive integer (#{inspect(v)})"
    end
  end

  defp pos_int_or_default(config, dotted, default) do
    case Map.fetch!(config.resolved, dotted) do
      v when is_integer(v) and v > 0 ->
        v

      v when is_binary(v) ->
        case Integer.parse(v) do
          {n, ""} when n > 0 -> n
          _ -> default
        end

      _ ->
        default
    end
  end

  defp csv(config, dotted) do
    case Map.fetch!(config.resolved, dotted) do
      list when is_list(list) ->
        Enum.map(list, &to_string/1)

      bin when is_binary(bin) ->
        bin
        |> String.split(",")
        |> Enum.map(&String.trim/1)
        |> Enum.reject(&(&1 == ""))

      other ->
        raise ArgumentError, "config: #{dotted} not a CSV/list (#{inspect(other)})"
    end
  end
end
