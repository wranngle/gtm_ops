defmodule Symphony.Tracker.Linear.Memory do
  @moduledoc """
  In-memory tracker adapter that satisfies the `Symphony.Tracker`
  behaviour without touching the Linear API. Used by the orchestrator
  and Linear adapter test suites so they can exercise the full
  behaviour contract without real GraphQL transport.

  Issue fixtures are read from `Application.get_env(:symphony,
  :linear_memory_issues, [])`. Tests can also send observable events
  (state queries) to a configured pid via `:linear_memory_recipient`.

  Selected via `tracker.kind: linear_memory` in `WORKFLOW.md`. The
  production `:linear` kind continues to dispatch to
  `Symphony.Tracker.Linear`.
  """

  @behaviour Symphony.Tracker

  alias Symphony.Tracker.Issue

  @impl true
  def fetch_candidate_issues(config) do
    active = Symphony.Config.tracker_active_states(config)
    fetch_issues_by_states(config, active)
  end

  @impl true
  def fetch_issues_by_states(_config, state_names) do
    wanted =
      state_names
      |> Enum.map(&normalize_state/1)
      |> MapSet.new()

    issues =
      Enum.filter(seed_issues(), fn %Issue{state: state} ->
        MapSet.member?(wanted, normalize_state(state))
      end)

    {:ok, issues}
  end

  @impl true
  def fetch_issue_states_by_ids(_config, ids) do
    notify({:linear_memory_state_lookup, ids})
    wanted = MapSet.new(ids)

    states =
      for %Issue{id: id, state: state} <- seed_issues(),
          MapSet.member?(wanted, id),
          into: %{},
          do: {id, state}

    {:ok, states}
  end

  # ============== Helpers ==============

  defp seed_issues do
    :symphony
    |> Application.get_env(:linear_memory_issues, [])
    |> Enum.filter(&match?(%Issue{}, &1))
  end

  defp notify(message) do
    case Application.get_env(:symphony, :linear_memory_recipient) do
      pid when is_pid(pid) -> send(pid, message)
      _ -> :ok
    end
  end

  defp normalize_state(s) when is_binary(s), do: s |> String.trim() |> String.downcase()
  defp normalize_state(_), do: ""
end
