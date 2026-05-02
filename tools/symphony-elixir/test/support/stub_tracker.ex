defmodule Symphony.Test.StubTracker do
  @moduledoc """
  In-process stub tracker adapter used by orchestrator tests. Holds
  candidate / terminal issue lists in an Agent so tests can mutate the
  state mid-run.
  """

  @behaviour Symphony.Tracker

  use Agent

  @initial %{
    candidates: [],
    terminal: [],
    by_id_states: %{}
  }

  def start_link(_opts \\ []) do
    Agent.start_link(fn -> @initial end, name: __MODULE__)
  end

  def reset do
    Agent.update(__MODULE__, fn _ -> @initial end)
  end

  def set_candidates(issues) when is_list(issues) do
    Agent.update(__MODULE__, fn s -> %{s | candidates: issues} end)
  end

  def set_terminal_issues(issues) when is_list(issues) do
    Agent.update(__MODULE__, fn s -> %{s | terminal: issues} end)
  end

  def set_states_by_id(map) when is_map(map) do
    Agent.update(__MODULE__, fn s -> %{s | by_id_states: map} end)
  end

  @impl Symphony.Tracker
  def fetch_candidate_issues(_config) do
    case Process.whereis(__MODULE__) do
      nil -> {:ok, []}
      _ -> {:ok, Agent.get(__MODULE__, & &1.candidates)}
    end
  end

  @impl Symphony.Tracker
  def fetch_issues_by_states(_config, states) when is_list(states) do
    case Process.whereis(__MODULE__) do
      nil ->
        {:ok, []}

      _ ->
        all = Agent.get(__MODULE__, fn s -> s.candidates ++ s.terminal end)
        norm = Enum.map(states, &String.downcase/1)

        filtered =
          Enum.filter(all, fn issue ->
            String.downcase(issue.state || "") in norm
          end)

        {:ok, filtered}
    end
  end

  @impl Symphony.Tracker
  def fetch_issue_states_by_ids(_config, ids) when is_list(ids) do
    case Process.whereis(__MODULE__) do
      nil ->
        {:ok, %{}}

      _ ->
        explicit = Agent.get(__MODULE__, & &1.by_id_states)

        all =
          Agent.get(__MODULE__, fn s -> s.candidates ++ s.terminal end)
          |> Enum.into(%{}, fn issue -> {issue.id, issue.state} end)

        merged = Map.merge(all, explicit)

        states =
          ids
          |> Enum.map(fn id -> {id, Map.get(merged, id)} end)
          |> Enum.reject(fn {_id, s} -> is_nil(s) end)
          |> Enum.into(%{})

        {:ok, states}
    end
  end
end
