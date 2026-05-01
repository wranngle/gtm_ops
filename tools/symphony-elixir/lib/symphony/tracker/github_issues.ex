defmodule Symphony.Tracker.GitHubIssues do
  @moduledoc """
  Tracker adapter that uses the `gh` CLI against `tracker.repo`. Mirrors
  the Bash `scripts/symphony.sh` `github_issues` adapter.

  State mapping (Symphony state → GitHub state + label):

    | Symphony     | GitHub                                |
    |--------------|---------------------------------------|
    | todo         | open + `symphony:todo` (or no label)  |
    | in_progress  | open + `symphony:in-progress`         |
    | human_review | open + `symphony:human-review`        |
    | done         | closed (no specific label)            |
    | cancelled    | closed + `symphony:cancelled`         |
    | duplicate    | closed + `symphony:duplicate`         |

  Priority comes from a `priority:N` label (falls back to nil).
  Blocked-by is parsed from a `Blocked-by: #N` body marker.
  """

  @behaviour Symphony.Tracker

  alias Symphony.Config
  alias Symphony.Tracker.Issue

  require Logger

  @impl true
  def fetch_candidate_issues(config) do
    case fetch_open_issues(config) do
      {:ok, payload} ->
        issues =
          payload
          |> Enum.map(&from_gh_payload(&1))
          |> Enum.filter(&candidate?(&1, config))

        {:ok, issues}

      {:error, _} = err ->
        err
    end
  end

  @impl true
  def fetch_issues_by_states(config, states) do
    case fetch_open_issues(config) do
      {:ok, open_payload} ->
        open = Enum.map(open_payload, &from_gh_payload/1)

        closed =
          case fetch_closed_issues(config) do
            {:ok, closed_payload} -> Enum.map(closed_payload, &from_gh_payload/1)
            {:error, _} -> []
          end

        wanted = MapSet.new(states)
        all = open ++ closed
        {:ok, Enum.filter(all, &MapSet.member?(wanted, &1.state))}

      {:error, _} = err ->
        err
    end
  end

  @impl true
  def fetch_issue_states_by_ids(config, ids) do
    repo = require_repo!(config)

    states =
      Enum.reduce(ids, %{}, fn id, acc ->
        case run_gh(["issue", "view", id, "--repo", repo, "--json", "number,state,labels"]) do
          {:ok, json} ->
            case Jason.decode(json) do
              {:ok, payload} ->
                state = derive_state(payload["state"], get_label_names(payload["labels"]))
                Map.put(acc, id, state)

              _ ->
                acc
            end

          {:error, _} ->
            acc
        end
      end)

    {:ok, states}
  rescue
    e ->
      Logger.warning(
        "symphony.tracker.github_issues.state_refresh_failed reason=#{Exception.message(e)}"
      )

      {:error, {:gh_state_refresh, Exception.message(e)}}
  end

  # ============== Helpers ==============

  defp fetch_open_issues(config) do
    repo = require_repo!(config)

    case run_gh([
           "issue",
           "list",
           "--repo",
           repo,
           "--state",
           "open",
           "--limit",
           "200",
           "--json",
           "number,title,body,labels,state,createdAt,updatedAt,url"
         ]) do
      {:ok, json} -> Jason.decode(json)
      {:error, _} = err -> err
    end
  rescue
    e -> {:error, {:gh_open_fetch, Exception.message(e)}}
  end

  defp fetch_closed_issues(config) do
    repo = require_repo!(config)

    case run_gh([
           "issue",
           "list",
           "--repo",
           repo,
           "--state",
           "closed",
           "--limit",
           "200",
           "--json",
           "number,title,body,labels,state,createdAt,updatedAt,url"
         ]) do
      {:ok, json} -> Jason.decode(json)
      {:error, _} = err -> err
    end
  end

  @doc false
  def from_gh_payload(payload) do
    number = to_string(payload["number"])
    label_names = get_label_names(payload["labels"])
    state = derive_state(payload["state"], label_names)

    %Issue{
      id: number,
      identifier: "gh-#{number}",
      title: payload["title"] || "",
      description: payload["body"] || "",
      priority: parse_priority_label(label_names),
      state: state,
      url: payload["url"],
      labels: label_names,
      blocked_by: parse_blocked_by_body(payload["body"]),
      created_at: parse_iso(payload["createdAt"]),
      updated_at: parse_iso(payload["updatedAt"])
    }
  end

  defp candidate?(%Issue{state: state}, config) do
    state in Config.tracker_active_states(config)
  end

  defp get_label_names(labels) when is_list(labels) do
    Enum.map(labels, fn
      %{"name" => n} -> n
      label -> to_string(label)
    end)
  end

  defp get_label_names(_), do: []

  defp derive_state(gh_state, labels) do
    cond do
      "symphony:in-progress" in labels -> "in_progress"
      "symphony:human-review" in labels -> "human_review"
      "symphony:cancelled" in labels -> "cancelled"
      "symphony:duplicate" in labels -> "duplicate"
      "symphony:todo" in labels -> "todo"
      String.upcase("#{gh_state}") == "OPEN" -> "todo"
      String.upcase("#{gh_state}") == "CLOSED" -> "done"
      true -> "todo"
    end
  end

  defp parse_priority_label(labels) do
    Enum.find_value(labels, fn label ->
      case Regex.run(~r/^priority:(\d+)$/, label) do
        [_, n] -> String.to_integer(n)
        _ -> nil
      end
    end)
  end

  @doc false
  def parse_blocked_by_body(nil), do: []
  def parse_blocked_by_body(body) do
    case Regex.run(~r/^[ \t]*blocked-by:[ \t]*([0-9# ,]+)\s*$/im, body) do
      [_, refs] ->
        refs
        |> String.split([",", " "], trim: true)
        |> Enum.map(&String.trim/1)
        |> Enum.map(&String.trim_leading(&1, "#"))
        |> Enum.reject(&(&1 == ""))
        |> Enum.map(fn n -> %{id: n, identifier: "gh-#{n}", state: nil} end)

      _ ->
        []
    end
  end

  defp parse_iso(nil), do: nil
  defp parse_iso(s) when is_binary(s) do
    case DateTime.from_iso8601(s) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  defp parse_iso(_), do: nil

  defp require_repo!(config) do
    case Config.tracker_repo(config) do
      nil ->
        raise ArgumentError, "github_issues adapter requires tracker.repo in WORKFLOW.md"

      "" ->
        raise ArgumentError, "github_issues adapter requires tracker.repo in WORKFLOW.md"

      repo ->
        repo
    end
  end

  defp run_gh(args) do
    case System.cmd("gh", args, stderr_to_stdout: true) do
      {output, 0} ->
        {:ok, output}

      {output, status} ->
        {:error, {:gh_nonzero_exit, status, output}}
    end
  rescue
    e in ErlangError ->
      case e do
        %ErlangError{original: :enoent} -> {:error, :gh_cli_not_found}
        _ -> {:error, {:gh_unknown, Exception.message(e)}}
      end
  end
end
