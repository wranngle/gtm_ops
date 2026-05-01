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

  alias Symphony.WorkflowLoader

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

  @defaults %{
    "tracker.kind" => "local_markdown",
    "tracker.endpoint" => "https://api.linear.app/graphql",
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
    resolved =
      Enum.reduce(@defaults, %{}, fn {dotted, default}, acc ->
        value =
          case fetch_raw(raw, dotted) do
            :missing -> default
            {:ok, v} -> v
          end

        Map.put(acc, dotted, maybe_resolve_env(dotted, value))
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
  def hooks_timeout_ms(config), do: pos_int!(config, "hooks.timeout_ms")

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

  defp maybe_resolve_env(dotted, value) when is_binary(value) do
    if dotted in @env_resolvable do
      resolve_env(value)
    else
      value
    end
  end

  defp maybe_resolve_env(_dotted, value), do: value

  defp resolve_env("$" <> var_name) do
    System.get_env(var_name) || ""
  end

  defp resolve_env(value), do: value

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
      v when is_integer(v) and v > 0 -> v
      v when is_binary(v) ->
        case Integer.parse(v) do
          {n, ""} when n > 0 -> n
          _ -> raise ArgumentError, "config: #{dotted} not a positive integer (#{inspect(v)})"
        end
      v ->
        raise ArgumentError, "config: #{dotted} not a positive integer (#{inspect(v)})"
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
