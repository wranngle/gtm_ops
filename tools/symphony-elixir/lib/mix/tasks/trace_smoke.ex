defmodule Mix.Tasks.Symphony.TraceSmoke do
  @moduledoc """
  Emit one synthetic OTLP trace span for the local observability smoke test.

  Usage:

      mix symphony.trace_smoke
      mix symphony.trace_smoke --marker smoke-trace-123
      mix symphony.trace_smoke --endpoint http://127.0.0.1:4318/v1/traces

  The task does not start the Symphony application, so it will not boot the
  orchestrator while smoke testing the tracing path.
  """

  use Mix.Task

  @shortdoc "Emit one synthetic OTLP span"
  @switches [marker: :string, endpoint: :string, timeout_ms: :integer]

  @impl Mix.Task
  def run(args) do
    {opts, _argv, invalid} = OptionParser.parse(args, strict: @switches)

    if invalid != [] do
      Mix.raise("invalid option(s): #{inspect(invalid)}")
    end

    marker = Keyword.get(opts, :marker, default_marker())

    trace_opts =
      []
      |> maybe_put(:endpoint, Keyword.get(opts, :endpoint))
      |> maybe_put(:timeout_ms, Keyword.get(opts, :timeout_ms))

    case Symphony.Tracing.emit_smoke_span(marker, trace_opts) do
      :ok ->
        Mix.shell().info("symphony.trace_smoke outcome=success marker=#{marker}")
        :ok

      {:error, reason} ->
        Mix.raise("symphony.trace_smoke failed marker=#{marker} reason=#{inspect(reason)}")
    end
  end

  defp maybe_put(opts, _key, nil), do: opts
  defp maybe_put(opts, key, value), do: Keyword.put(opts, key, value)

  defp default_marker do
    "smoke-traces-#{System.system_time(:millisecond)}"
  end
end
