defmodule Symphony.Logging do
  @moduledoc """
  ECS-jsonl logger for Symphony events.

  One JSON object per line, written to whatever sink the orchestrator
  has configured (defaults to `:stderr`). The shape mirrors the existing
  Bash adapter at `scripts/symphony.sh` so downstream consumers can
  read either source uniformly:

      {"@timestamp": "...", "log.level": "info", "event.action": "...",
       "event.outcome": "success", "service.name": "wranngle-local-symphony",
       "issue.identifier": "...", "message": "..."}

  Per spec section 13.1, every issue-related event must include
  `issue.identifier` and (where available) `session.id`.
  """

  alias Symphony.Logging.Sink

  @service_name "wranngle-local-symphony"

  @type level :: :debug | :info | :warning | :error
  @type outcome :: :success | :failure | :unknown

  @spec emit(level(), String.t(), outcome(), keyword()) :: :ok
  def emit(level, action, outcome, opts \\ []) do
    fields = Keyword.get(opts, :fields, %{})
    issue = Keyword.get(opts, :issue, "")
    message = Keyword.get(opts, :message, "")

    event =
      Map.merge(
        %{
          "@timestamp" => iso_now(),
          "log.level" => Atom.to_string(level),
          "event.action" => action,
          "event.outcome" => Atom.to_string(outcome),
          "service.name" => @service_name,
          "issue.identifier" => to_string(issue),
          "message" => to_string(message)
        },
        stringify_keys(fields)
      )

    Sink.write(event)
    :ok
  end

  defp iso_now do
    DateTime.utc_now()
    |> DateTime.to_iso8601()
  end

  defp stringify_keys(map) when is_map(map) do
    for {k, v} <- map, into: %{}, do: {to_string(k), stringify_value(v)}
  end

  defp stringify_value(v) when is_atom(v) and not is_boolean(v) and not is_nil(v),
    do: Atom.to_string(v)

  defp stringify_value(v), do: v
end
