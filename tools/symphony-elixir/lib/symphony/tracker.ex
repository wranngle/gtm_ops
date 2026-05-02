defmodule Symphony.Tracker do
  @moduledoc """
  Behaviour every Symphony tracker adapter must implement.

  Per spec section 11.1, an adapter must support three operations:

    * `fetch_candidate_issues/1` — issues currently in active states
    * `fetch_issues_by_states/2` — issues in arbitrary state names
    * `fetch_issue_states_by_ids/2` — current state for specified issue IDs

  Adapters return normalized `%Symphony.Tracker.Issue{}` records (spec
  section 4.1.1) so the orchestrator can reason about issues without
  knowing the underlying tracker shape.
  """

  alias Symphony.Config

  defmodule Issue do
    @moduledoc "Normalized issue record per spec section 4.1.1."

    @type t :: %__MODULE__{
            id: binary(),
            identifier: binary(),
            title: binary(),
            description: binary() | nil,
            priority: integer() | nil,
            state: binary(),
            branch_name: binary() | nil,
            url: binary() | nil,
            assignee_id: binary() | nil,
            labels: [binary()],
            blocked_by: [%{id: binary() | nil, identifier: binary() | nil, state: binary() | nil}],
            assigned_to_worker: boolean(),
            created_at: DateTime.t() | nil,
            updated_at: DateTime.t() | nil
          }

    defstruct id: "",
              identifier: "",
              title: "",
              description: nil,
              priority: nil,
              state: "",
              branch_name: nil,
              url: nil,
              assignee_id: nil,
              labels: [],
              blocked_by: [],
              assigned_to_worker: true,
              created_at: nil,
              updated_at: nil
  end

  @callback fetch_candidate_issues(Config.t()) :: {:ok, [Issue.t()]} | {:error, term()}
  @callback fetch_issues_by_states(Config.t(), [binary()]) ::
              {:ok, [Issue.t()]} | {:error, term()}
  @callback fetch_issue_states_by_ids(Config.t(), [binary()]) ::
              {:ok, %{required(binary()) => binary()}} | {:error, term()}

  @doc """
  Resolve the adapter module for a given config.

  `:linear_memory` is a test-only variant of the Linear adapter (see
  `Symphony.Tracker.Linear.Memory`) that lets the orchestrator + tracker
  test suites exercise the behaviour contract without real Linear creds
  or HTTP. Kept here rather than only registered in test config so the
  unsupported-tracker error path stays tight to actually unknown kinds
  (per spec section 11.4 `unsupported_tracker_kind`).
  """
  @spec adapter_for(Config.t()) :: {:ok, module()} | {:error, term()}
  def adapter_for(config) do
    case Config.tracker_kind(config) do
      :local_markdown -> {:ok, Symphony.Tracker.LocalMarkdown}
      :github_issues -> {:ok, Symphony.Tracker.GitHubIssues}
      :linear -> {:ok, Symphony.Tracker.Linear}
      :linear_memory -> {:ok, Symphony.Tracker.Linear.Memory}
      :noop -> {:ok, Symphony.Tracker.Noop}
      kind -> {:error, {:unsupported_tracker, kind}}
    end
  end

  # ============== Upstream-compatible zero/one-arg facade ==============
  # Upstream `SymphonyElixir.Tracker` exposes 0- and 1-arg helpers that
  # consult the global `Config.settings!()` to pick an adapter. Our
  # spec § 11.1 contract threads `config` through every callback for
  # explicit dependency. To keep upstream tests + helper scripts that
  # call `Symphony.Tracker.fetch_candidate_issues()` working, the
  # facade resolves the current adapter via `Config.settings!()` and
  # delegates. Test overrides via `Application.put_env(:symphony,
  # :tracker_adapter_override, Module)` short-circuit the resolution.

  @spec adapter() :: module()
  def adapter do
    case Application.get_env(:symphony, :tracker_adapter_override) do
      mod when is_atom(mod) and not is_nil(mod) ->
        mod

      _ ->
        case settings_tracker_kind() do
          "memory" -> Symphony.Tracker.Linear.Memory
          "linear" -> Symphony.Tracker.Linear
          "github_issues" -> Symphony.Tracker.GitHubIssues
          "local_markdown" -> Symphony.Tracker.LocalMarkdown
          "noop" -> Symphony.Tracker.Noop
          _ -> Symphony.Tracker.Linear
        end
    end
  end

  @spec fetch_candidate_issues() :: {:ok, [term()]} | {:error, term()}
  def fetch_candidate_issues, do: adapter().fetch_candidate_issues()

  @spec fetch_issues_by_states([term()]) :: {:ok, [term()]} | {:error, term()}
  def fetch_issues_by_states(states) when is_list(states),
    do: adapter().fetch_issues_by_states(states)

  @spec fetch_issue_states_by_ids([binary()]) :: {:ok, [term()]} | {:error, term()}
  def fetch_issue_states_by_ids(issue_ids) when is_list(issue_ids),
    do: adapter().fetch_issue_states_by_ids(issue_ids)

  @spec create_comment(binary(), binary()) :: :ok | {:error, term()}
  def create_comment(issue_id, body) when is_binary(issue_id) and is_binary(body) do
    if function_exported?(adapter(), :create_comment, 2) do
      adapter().create_comment(issue_id, body)
    else
      :ok
    end
  end

  @spec update_issue_state(binary(), binary()) :: :ok | {:error, term()}
  def update_issue_state(issue_id, state_name)
      when is_binary(issue_id) and is_binary(state_name) do
    if function_exported?(adapter(), :update_issue_state, 2) do
      adapter().update_issue_state(issue_id, state_name)
    else
      :ok
    end
  end

  defp settings_tracker_kind do
    case Config.settings!() do
      %{tracker: %{kind: kind}} when is_binary(kind) -> kind
      _ -> "local_markdown"
    end
  rescue
    _ -> "local_markdown"
  end
end
