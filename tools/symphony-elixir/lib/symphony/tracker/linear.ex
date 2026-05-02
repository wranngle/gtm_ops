defmodule Symphony.Tracker.Linear do
  @moduledoc """
  Linear-backed implementation of the `Symphony.Tracker` behaviour
  (spec section 11). Delegates GraphQL transport, pagination, and error
  mapping to `Symphony.Tracker.Linear.Client`; this module exists so the
  orchestrator only has to know about a single behaviour-conforming
  module per `tracker.kind`.

  Spec section 11.5 boundary: ticket mutations (state transitions,
  comments, PR metadata) are agent-tool responsibilities and are
  intentionally not exposed here.
  """

  @behaviour Symphony.Tracker

  alias Symphony.Tracker.Linear.Client

  @impl true
  def fetch_candidate_issues(config), do: Client.fetch_candidate_issues(config)

  @impl true
  def fetch_issues_by_states(config, states), do: Client.fetch_issues_by_states(config, states)

  @impl true
  def fetch_issue_states_by_ids(config, ids), do: Client.fetch_issue_states_by_ids(config, ids)
end
