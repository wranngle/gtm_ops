defmodule Symphony.Tracker.Linear do
  @moduledoc """
  Linear-backed implementation of the `Symphony.Tracker` behaviour
  (spec section 11). Delegates GraphQL transport, pagination, and error
  mapping to `Symphony.Tracker.Linear.Client`; this module exists so the
  orchestrator only has to know about a single behaviour-conforming
  module per `tracker.kind`.

  Read-side behaviour callbacks (spec section 11.1) cover the
  orchestrator's polling loop. The write-side `post_comment/3` is
  carved out here as an explicit operator-audit primitive: when the
  dogfood loop transitions an issue (pickup, hand-off, close), the
  orchestrator can leave a one-line comment so a human browsing
  Linear sees who touched what when, without having to cross-reference
  workspace logs or git history.
  """

  @behaviour Symphony.Tracker

  alias Symphony.Tracker.Linear.Client

  @impl true
  def fetch_candidate_issues(config), do: Client.fetch_candidate_issues(config)

  @impl true
  def fetch_issues_by_states(config, states), do: Client.fetch_issues_by_states(config, states)

  @impl true
  def fetch_issue_states_by_ids(config, ids), do: Client.fetch_issue_states_by_ids(config, ids)

  @doc """
  Post a comment to a Linear issue. Operator-facing audit trail for
  agent-driven state transitions.

  Returns `{:ok, %{id: comment_id, url: comment_url}}` on success or an
  `{:error, reason}` tuple from `Symphony.Tracker.Linear.Client`'s
  standard error categories (spec section 11.4).
  """
  @spec post_comment(Symphony.Config.t(), binary(), binary(), keyword()) ::
          {:ok, %{id: binary(), url: binary() | nil}} | {:error, term()}
  def post_comment(config, issue_id, body, opts \\ []),
    do: Client.post_comment(config, issue_id, body, opts)
end
