defmodule Symphony.Web.Presenter do
  @moduledoc """
  View-model transforms for the observability LiveView (spec § 13.3 +
  § 13.6).

  Adapts `Symphony.snapshot/0` (which returns `{:ok, map} |
  {:error, :timeout | :unavailable}`) into a stable JSON-friendly map
  with `running`, `retrying`, `codex_totals`, `rate_limits`, `counts`,
  `polling` (poll-loop visibility — `poll_interval_ms` +
  `next_poll_in_ms`, with `checking?` once the orchestrator emits it
  per STACK-075), and a `recent_events` projection.
  """

  alias Symphony.StatusDashboard

  @type snapshot_fun :: (-> {:ok, map()} | {:error, :timeout | :unavailable})

  @doc """
  Build the dashboard view-model. Accepts a 0-arity snapshot function so
  tests can inject a stub instead of booting the orchestrator.
  """
  @spec state_payload(snapshot_fun() | nil) :: map()
  def state_payload(snapshot_fun \\ nil) do
    snapshot_fun = snapshot_fun || (&Symphony.snapshot/0)
    generated_at = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    case snapshot_fun.() do
      {:ok, %{} = snapshot} ->
        %{
          generated_at: generated_at,
          counts: %{
            running: length(snapshot.running),
            retrying: length(snapshot.retrying)
          },
          running: Enum.map(snapshot.running, &running_entry/1),
          retrying: Enum.map(snapshot.retrying, &retry_entry/1),
          codex_totals: snapshot.codex_totals,
          rate_limits: snapshot.rate_limits,
          polling: polling_payload(snapshot),
          recent_events: StatusDashboard.recent_events(snapshot, limit: 20)
        }

      {:error, :timeout} ->
        %{
          generated_at: generated_at,
          error: %{code: "snapshot_timeout", message: "Snapshot timed out"}
        }

      {:error, :unavailable} ->
        %{
          generated_at: generated_at,
          error: %{code: "snapshot_unavailable", message: "Snapshot unavailable"}
        }

      _ ->
        %{
          generated_at: generated_at,
          error: %{code: "snapshot_unavailable", message: "Snapshot unavailable"}
        }
    end
  end

  @doc "Issue-specific projection (drill-down). Returns `{:ok, map} | {:error, :issue_not_found}`."
  @spec issue_payload(String.t(), snapshot_fun() | nil) ::
          {:ok, map()} | {:error, :issue_not_found | :unavailable}
  def issue_payload(identifier, snapshot_fun \\ nil) when is_binary(identifier) do
    snapshot_fun = snapshot_fun || (&Symphony.snapshot/0)

    case snapshot_fun.() do
      {:ok, %{} = snapshot} ->
        running = Enum.find(snapshot.running, &(&1.identifier == identifier))
        retry = Enum.find(snapshot.retrying, &(&1.identifier == identifier))

        if is_nil(running) and is_nil(retry) do
          {:error, :issue_not_found}
        else
          {:ok,
           %{
             identifier: identifier,
             status: status(running, retry),
             running: running && running_entry(running),
             retry: retry && retry_entry(retry)
           }}
        end

      _ ->
        {:error, :unavailable}
    end
  end

  defp status(_running, nil), do: "running"
  defp status(nil, _retry), do: "retrying"
  defp status(_, _), do: "running"

  defp running_entry(entry) do
    %{
      issue_id: Map.get(entry, :issue_id),
      issue_identifier: entry.identifier,
      identifier: entry.identifier,
      state: entry.state,
      session_id: entry.session_id,
      turn_count: Map.get(entry, :turn_count, 0),
      last_event: entry.last_codex_event,
      last_message: summarize_message(entry.last_codex_message),
      started_at: iso8601(entry.started_at),
      last_event_at: iso8601(entry.last_codex_timestamp),
      tokens: %{
        input_tokens: Map.get(entry, :codex_input_tokens),
        output_tokens: Map.get(entry, :codex_output_tokens),
        total_tokens: Map.get(entry, :codex_total_tokens)
      }
    }
  end

  defp retry_entry(entry) do
    %{
      issue_id: Map.get(entry, :issue_id),
      issue_identifier: entry.identifier,
      identifier: entry.identifier,
      attempt: entry.attempt,
      due_at: due_at_iso8601(entry.due_in_ms),
      due_in_ms: entry.due_in_ms,
      error: Map.get(entry, :error)
    }
  end

  defp summarize_message(nil), do: nil
  defp summarize_message(message), do: StatusDashboard.humanize_codex_message(message)

  # Surface the orchestrator's poll-loop visibility (spec § 13.5 +
  # STACK-075). `:polling` is always returned as a map so the LiveView
  # and `/api/snapshot` consumers can render "next poll in N s" /
  # "checking…" without nil-checks. Tolerates older snapshots that
  # don't include `:polling` yet.
  defp polling_payload(snapshot) do
    case Map.get(snapshot, :polling) do
      %{} = polling ->
        %{
          poll_interval_ms: Map.get(polling, :poll_interval_ms),
          next_poll_in_ms: Map.get(polling, :next_poll_in_ms),
          checking?: Map.get(polling, :checking?, false)
        }

      _ ->
        %{poll_interval_ms: nil, next_poll_in_ms: nil, checking?: false}
    end
  end

  defp due_at_iso8601(due_in_ms) when is_integer(due_in_ms) do
    DateTime.utc_now()
    |> DateTime.add(div(due_in_ms, 1_000), :second)
    |> DateTime.truncate(:second)
    |> DateTime.to_iso8601()
  end

  defp due_at_iso8601(_), do: nil

  defp iso8601(%DateTime{} = dt), do: dt |> DateTime.truncate(:second) |> DateTime.to_iso8601()
  defp iso8601(_), do: nil
end
