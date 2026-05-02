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
            labels: [binary()],
            blocked_by: [%{id: binary() | nil, identifier: binary() | nil, state: binary() | nil}],
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
              labels: [],
              blocked_by: [],
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
end
