defmodule Symphony.Config do
  @moduledoc """
  Typed view of the workflow configuration, per Symphony spec section 5.3 + 6.

  Single-source-of-truth representation: every consumer reads via the
  typed `Symphony.Config.Schema.t()` struct, accessed either through
  `Config.settings!()` (the upstream-shaped zero-arg accessor) or
  through the per-config getters below. The latter take a
  `Symphony.Config.Settings.t()` value built by `from_workflow/1`,
  which carries the parsed `Schema.t()` plus the workflow file's
  `source_path` (needed by callers that re-load `WORKFLOW.md` from
  inside an agent runner).

  Construction:

      iex> {:ok, workflow} = Symphony.WorkflowLoader.load(path)
      iex> {:ok, config} = Symphony.Config.from_workflow(workflow)
      iex> Symphony.Config.tracker_kind(config)
      :local_markdown

  Validation errors are returned as
  `{:error, {:invalid_workflow_config, message}}` rather than raised,
  so the orchestrator can decide whether to fail startup or skip a
  tick.

  ## Migration history

  Until 2026-05-02 this module exposed a parallel "dotted-key" data
  shape (`%{raw, resolved, source_path}`) alongside the typed
  `Schema`. PR (b) of the dual-track collapse (see
  `docs/references/symphony-config-dual-track-audit.md`) replaced the
  dotted shape with `Settings.t()` so there is now exactly one
  representation. The getter functions kept their names and arities
  so call sites did not need changing.
  """

  alias Symphony.Config.Schema
  alias Symphony.Config.Settings
  alias Symphony.Workflow
  alias Symphony.WorkflowLoader

  # Upstream-compatible default prompt used by `workflow_prompt/0` when the
  # workflow file is missing or its prompt body is blank. Mirrors the
  # template baked into upstream `SymphonyElixir.Config` so prompt-builder
  # tests can rely on the same fallback contract.
  @default_prompt_template """
  You are working on a Linear issue.

  Identifier: {{ issue.identifier }}
  Title: {{ issue.title }}

  Body:
  {% if issue.description %}
  {{ issue.description }}
  {% else %}
  No description provided.
  {% endif %}
  """

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

  @type t :: Settings.t()

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

      {:error, reason} ->
        raise ArgumentError, message: format_config_error(reason)

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

  @doc """
  Upstream-compatible result variant of `settings!/0`. Returns
  `{:ok, schema}` when the workflow loads and parses cleanly; otherwise
  returns the raw error tuple from `Workflow.current/0` or
  `Schema.parse/1` so callers (most notably `validate!/0`) can pattern
  match on validation failures without catching `ArgumentError`.
  """
  @spec settings() :: {:ok, Schema.t()} | {:error, term()}
  def settings do
    case Workflow.current() do
      {:ok, %{config: config} = workflow} when is_map(config) ->
        Schema.parse(config, workflow_dir(workflow))

      {:ok, _other} ->
        {:error, :workflow_front_matter_not_a_map}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp workflow_dir(%{source_path: path}) when is_binary(path), do: Path.dirname(path)
  defp workflow_dir(_), do: nil

  @doc """
  Upstream-compatible workflow-prompt accessor. Returns the prompt body
  from `WORKFLOW.md` when present and non-blank, otherwise falls back to
  the built-in `@default_prompt_template` so prompt rendering can still
  proceed with a sensible default (spec § 5.5 / § 12).
  """
  @spec workflow_prompt() :: String.t()
  def workflow_prompt do
    case Workflow.current() do
      {:ok, %{prompt_template: prompt}} when is_binary(prompt) ->
        if String.trim(prompt) == "", do: @default_prompt_template, else: prompt

      _ ->
        @default_prompt_template
    end
  end

  @doc """
  Upstream-compatible semantic validator. Combines schema-level parsing
  (`Schema.parse/1`) with cross-field rules that the typed schema cannot
  express on its own (e.g. `tracker.kind == "linear"` requires an API
  key + project slug).
  """
  @spec validate!() :: :ok | {:error, term()}
  def validate! do
    with {:ok, settings} <- settings() do
      validate_semantics(settings)
    end
  end

  defp validate_semantics(settings) do
    cond do
      is_nil(settings.tracker.kind) ->
        {:error, :missing_tracker_kind}

      settings.tracker.kind not in ["linear", "memory"] ->
        {:error, {:unsupported_tracker_kind, settings.tracker.kind}}

      settings.tracker.kind == "linear" and not is_binary(settings.tracker.api_key) ->
        {:error, :missing_linear_api_token}

      settings.tracker.kind == "linear" and not is_binary(settings.tracker.project_slug) ->
        {:error, :missing_linear_project_slug}

      true ->
        :ok
    end
  end

  defp format_config_error(reason) do
    case reason do
      {:invalid_workflow_config, message} ->
        "Invalid WORKFLOW.md config: #{message}"

      {:missing_workflow_file, path, raw_reason} ->
        "Missing WORKFLOW.md at #{path}: #{inspect(raw_reason)}"

      {:workflow_parse_error, raw_reason} ->
        "Failed to parse WORKFLOW.md: #{inspect(raw_reason)}"

      :workflow_front_matter_not_a_map ->
        "Failed to parse WORKFLOW.md: workflow front matter must decode to a map"

      other ->
        "Invalid WORKFLOW.md config: #{inspect(other)}"
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
        {:ok, %{config: config} = workflow} when is_map(config) ->
          case Schema.parse(config, workflow_dir(workflow)) do
            {:ok, parsed} -> {:ok, parsed}
            {:error, _reason} = err -> err
          end

        {:error, {:missing_workflow_file, _path, _reason}} ->
          # No workflow file on disk at all — fall back to defaults so the
          # dashboard formatter and other read-only surfaces remain usable
          # in isolation (e.g. StatusDashboardSnapshotTest).
          :default

        {:error, _reason} = err ->
          err

        _ ->
          :default
      end
    else
      :default
    end
  rescue
    _ -> :default
  end

  @doc """
  Build a `Settings.t()` from a loaded workflow. Returns `{:ok,
  settings}` or `{:error, reason}` from `Schema.parse/2`. The resulting
  struct carries the parsed `Schema.t()` plus the workflow's
  `source_path` for callers that need to re-read `WORKFLOW.md` from
  inside an agent runner (see `Symphony.AgentRunner.LocalShell` and
  `Symphony.AgentRunner.CodexAppServer`).
  """
  @spec from_workflow(WorkflowLoader.workflow()) :: {:ok, t()} | {:error, term()}
  def from_workflow(%{config: raw, source_path: path}) when is_map(raw) do
    workflow_dir = path && Path.dirname(path)

    case raw |> normalize_csv_arrays() |> Schema.parse(workflow_dir) do
      {:ok, schema} -> {:ok, %Settings{schema: schema, source_path: path}}
      {:error, _} = err -> err
    end
  end

  # Backwards-compat with the old dotted-key parser: callers occasionally
  # write `tracker.active_states: "todo,in_progress"` as a CSV string
  # rather than the YAML list `[todo, in_progress]`. Schema strictly
  # types these as `{:array, :string}`, so we coerce CSV strings to
  # lists before handing the raw map to `Schema.parse/2`.
  defp normalize_csv_arrays(raw) when is_map(raw) do
    Map.update(raw, "tracker", %{}, fn tracker when is_map(tracker) ->
      tracker
      |> coerce_csv("active_states")
      |> coerce_csv("terminal_states")
    end)
  end

  defp coerce_csv(map, key) do
    case Map.get(map, key) do
      bin when is_binary(bin) ->
        Map.put(
          map,
          key,
          bin
          |> String.split(",")
          |> Enum.map(&String.trim/1)
          |> Enum.reject(&(&1 == ""))
        )

      _ ->
        map
    end
  end

  @doc """
  Empty `Settings.t()` for callers that need a non-nil placeholder
  (e.g. test fakes, the Linear tracker's zero-arg facade fallback).
  Backed by `Schema.parse/1` of an empty map so every nested embed is
  populated with its declared defaults instead of being `nil`.
  """
  @spec empty() :: t()
  def empty do
    {:ok, schema} = Schema.parse(%{})
    %Settings{schema: schema, source_path: nil}
  end

  # ============== Typed getters ==============
  #
  # These wrap `settings.schema.<field>` access so call sites read like
  # `Config.tracker_kind(config)` rather than
  # `config.schema.tracker.kind |> String.to_atom()`. Single source of
  # truth: every getter projects from the typed schema.

  @spec tracker_kind(t()) :: :local_markdown | :github_issues | :linear | atom()
  def tracker_kind(config) do
    case schema(config).tracker.kind do
      nil -> :local_markdown
      kind -> kind |> to_string() |> String.to_atom()
    end
  end

  @spec tracker_repo(t()) :: binary() | nil
  def tracker_repo(config), do: schema(config).tracker.repo

  @spec tracker_endpoint(t()) :: binary()
  def tracker_endpoint(config) do
    case schema(config).tracker.endpoint do
      v when is_binary(v) and v != "" -> v
      _ -> raise ArgumentError, "config: tracker.endpoint must be a non-empty string"
    end
  end

  @spec tracker_api_key(t()) :: binary() | nil
  def tracker_api_key(config) do
    case schema(config).tracker.api_key do
      "" -> nil
      v -> v
    end
  end

  @spec tracker_project_slug(t()) :: binary() | nil
  def tracker_project_slug(config), do: schema(config).tracker.project_slug

  @spec tracker_issues_root(t()) :: binary() | nil
  def tracker_issues_root(config), do: schema(config).tracker.issues_root

  @spec tracker_active_states(t()) :: [binary()]
  def tracker_active_states(config), do: states_list(schema(config).tracker.active_states)

  @spec tracker_terminal_states(t()) :: [binary()]
  def tracker_terminal_states(config), do: states_list(schema(config).tracker.terminal_states)

  @spec polling_interval_ms(t()) :: pos_integer()
  def polling_interval_ms(config) do
    case schema(config).polling.interval_ms do
      v when is_integer(v) and v > 0 -> v
      v -> raise ArgumentError, "config: polling.interval_ms not a positive integer (#{inspect(v)})"
    end
  end

  @spec workspace_root(t()) :: binary()
  def workspace_root(config) do
    case schema(config).workspace.root do
      v when is_binary(v) and v != "" -> v
      _ -> raise ArgumentError, "config: workspace.root must be a non-empty string"
    end
  end

  @spec hooks_timeout_ms(t()) :: pos_integer()
  def hooks_timeout_ms(config) do
    case schema(config).hooks.timeout_ms do
      v when is_integer(v) and v > 0 -> v
      _ -> 60_000
    end
  end

  @spec hook_script(t(), :after_create | :before_run | :after_run | :before_remove) ::
          binary() | nil
  def hook_script(config, name) do
    case Map.get(schema(config).hooks, name) do
      v when is_binary(v) and v != "" -> v
      _ -> nil
    end
  end

  @spec agent_command(t()) :: binary()
  def agent_command(config) do
    case schema(config).agent.command do
      v when is_binary(v) and v != "" -> v
      _ -> raise ArgumentError, "config: agent.command must be a non-empty string"
    end
  end

  @spec agent_max_concurrent_agents(t()) :: pos_integer()
  def agent_max_concurrent_agents(config), do: pos_int!(schema(config).agent.max_concurrent_agents, "agent.max_concurrent_agents")

  @spec agent_max_retry_backoff_ms(t()) :: pos_integer()
  def agent_max_retry_backoff_ms(config), do: pos_int!(schema(config).agent.max_retry_backoff_ms, "agent.max_retry_backoff_ms")

  @spec agent_max_turns(t()) :: pos_integer()
  def agent_max_turns(config), do: pos_int!(schema(config).agent.max_turns, "agent.max_turns")

  @spec agent_runner_kind(t()) :: atom() | nil
  def agent_runner_kind(config) do
    case schema(config).agent.runner_kind do
      v when is_binary(v) and v != "" -> String.to_atom(v)
      _ -> nil
    end
  end

  @spec codex_command(t()) :: binary()
  def codex_command(config) do
    case schema(config).codex.command do
      v when is_binary(v) and v != "" -> v
      _ -> raise ArgumentError, "config: codex.command must be a non-empty string"
    end
  end

  @spec codex_read_timeout_ms(t()) :: pos_integer()
  def codex_read_timeout_ms(config), do: pos_int_or_default(schema(config).codex.read_timeout_ms, 5_000)

  @spec codex_turn_timeout_ms(t()) :: pos_integer()
  def codex_turn_timeout_ms(config), do: pos_int_or_default(schema(config).codex.turn_timeout_ms, 3_600_000)

  @spec codex_stall_timeout_ms(t()) :: non_neg_integer()
  def codex_stall_timeout_ms(config) do
    case schema(config).codex.stall_timeout_ms do
      v when is_integer(v) and v >= 0 -> v
      _ -> 300_000
    end
  end

  @doc """
  Spec § 6.3 dispatch preflight: validate the minimal config the
  scheduler needs before launching work this tick.
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
          |> add_if_missing(tracker_project_slug(config), :missing_tracker_project_slug)

        :github_issues ->
          add_if_missing(reasons, tracker_repo(config), :missing_tracker_repo)

        _ ->
          reasons
      end

    reasons =
      reasons
      |> add_if_missing(safe_codex_command(config), :missing_codex_command)
      |> add_if_missing(safe_agent_command(config), :missing_agent_command)

    case reasons do
      [] -> :ok
      list -> {:error, {:dispatch_preflight, Enum.reverse(list)}}
    end
  end

  defp add_if_missing(reasons, nil, atom), do: [atom | reasons]
  defp add_if_missing(reasons, "", atom), do: [atom | reasons]
  defp add_if_missing(reasons, _value, _atom), do: reasons

  defp safe_codex_command(config) do
    codex_command(config)
  rescue
    _ -> nil
  end

  defp safe_agent_command(config) do
    agent_command(config)
  rescue
    _ -> nil
  end

  # ============== Helpers ==============

  defp schema(%Settings{schema: schema}), do: schema
  defp schema(%Schema{} = schema), do: schema

  defp pos_int!(v, _label) when is_integer(v) and v > 0, do: v

  defp pos_int!(v, label) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} when n > 0 -> n
      _ -> raise ArgumentError, "config: #{label} not a positive integer (#{inspect(v)})"
    end
  end

  defp pos_int!(v, label),
    do: raise(ArgumentError, "config: #{label} not a positive integer (#{inspect(v)})")

  defp pos_int_or_default(v, _default) when is_integer(v) and v > 0, do: v

  defp pos_int_or_default(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} when n > 0 -> n
      _ -> default
    end
  end

  defp pos_int_or_default(_, default), do: default

  defp states_list(list) when is_list(list), do: Enum.map(list, &to_string/1)

  defp states_list(bin) when is_binary(bin) do
    bin
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp states_list(other),
    do: raise(ArgumentError, "config: tracker states not a CSV/list (#{inspect(other)})")
end
