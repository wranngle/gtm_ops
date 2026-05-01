defmodule Symphony.Tracker.Noop do
  @moduledoc """
  Tracker adapter that returns empty results. Used in tests and as the
  initial behaviour while real adapters (`local_markdown`, `github_issues`,
  `linear`) land in subsequent slices (T-7).
  """

  @behaviour Symphony.Tracker

  @impl true
  def fetch_candidate_issues(_config), do: {:ok, []}

  @impl true
  def fetch_issues_by_states(_config, _states), do: {:ok, []}

  @impl true
  def fetch_issue_states_by_ids(_config, _ids), do: {:ok, %{}}
end
