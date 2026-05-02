defmodule Symphony.Tracing do
  @moduledoc """
  Best-effort OTLP/HTTP trace emission for Symphony.

  The local observability stack exposes Vector's OTLP HTTP intake at
  `http://127.0.0.1:4318/v1/traces`. This module emits the small protobuf
  subset needed for one-span traces without making the orchestrator depend on
  a full tracing SDK. Export failures are returned from `emit_span/3` but are
  deliberately ignored by `span/4` so tracing cannot break dispatch.
  """

  import Bitwise

  @default_endpoint "http://127.0.0.1:4318/v1/traces"
  @default_service_name "wranngle-local-symphony"
  @default_timeout_ms 750

  @type attr_key :: atom() | String.t()
  @type attr_value :: String.t() | integer() | float() | boolean() | atom() | nil | term()
  @type attrs :: %{optional(attr_key()) => attr_value()} | keyword(attr_value())
  @type status :: :ok | :error | {:error, String.t()}

  @doc """
  Wrap `fun` in a single OTLP span.

  The wrapped function's result is returned unchanged. Exceptions, throws, and
  exits are re-raised after a failure span is attempted. A returned
  `{:error, reason}` tuple is also marked as an error span.
  """
  @spec span(String.t(), attrs(), (-> result), keyword()) :: result when result: term()
  def span(name, attrs, fun, opts \\ [])
      when is_binary(name) and is_function(fun, 0) and is_list(opts) do
    start_time = System.system_time(:nanosecond)

    try do
      result = fun.()

      safe_emit_span(
        name,
        attrs,
        Keyword.merge(opts, finish_opts(start_time, result_status(result)))
      )

      result
    rescue
      exception ->
        stacktrace = __STACKTRACE__

        error_attrs =
          Map.merge(normalize_attrs(attrs), %{
            "exception.type" => exception.__struct__ |> Module.split() |> Enum.join("."),
            "exception.message" => Exception.message(exception)
          })

        safe_emit_span(
          name,
          error_attrs,
          Keyword.merge(opts, finish_opts(start_time, {:error, Exception.message(exception)}))
        )

        reraise exception, stacktrace
    catch
      kind, reason ->
        stacktrace = __STACKTRACE__

        error_attrs =
          Map.merge(normalize_attrs(attrs), %{
            "exception.type" => Atom.to_string(kind),
            "exception.message" => inspect(reason, printable_limit: 200, limit: 20)
          })

        safe_emit_span(
          name,
          error_attrs,
          Keyword.merge(opts, finish_opts(start_time, {:error, inspect(reason)}))
        )

        :erlang.raise(kind, reason, stacktrace)
    end
  end

  @doc """
  Emit one span immediately and return the exporter outcome.

  This is used by `mix symphony.trace_smoke`; production orchestration should
  prefer `span/4` so trace export cannot affect worker control flow.
  """
  @spec emit_span(String.t(), attrs(), keyword()) :: :ok | {:error, term()}
  def emit_span(name, attrs, opts \\ []) when is_binary(name) and is_list(opts) do
    start_time = Keyword.get(opts, :start_time_unix_nano, System.system_time(:nanosecond))
    end_time = Keyword.get(opts, :end_time_unix_nano, System.system_time(:nanosecond))
    status = Keyword.get(opts, :status, :ok)

    span = %{
      trace_id: Keyword.get(opts, :trace_id, random_bytes(16)),
      span_id: Keyword.get(opts, :span_id, random_bytes(8)),
      name: name,
      start_time_unix_nano: start_time,
      end_time_unix_nano: max(end_time, start_time),
      attrs: normalize_attrs(attrs),
      status: normalize_status(status)
    }

    payload = encode_export_trace_service_request(span, opts)
    export_payload(payload, opts)
  end

  @doc """
  Emit the synthetic span used by the observability smoke test.
  """
  @spec emit_smoke_span(String.t(), keyword()) :: :ok | {:error, term()}
  def emit_smoke_span(marker, opts \\ []) when is_binary(marker) and is_list(opts) do
    emit_span(
      "symphony.trace_smoke",
      %{
        "user.journey" => "observability-smoke",
        "issue.identifier" => marker,
        "smoke.marker" => marker
      },
      opts
    )
  end

  @doc false
  @spec encode_export_trace_service_request_for_test(map(), keyword()) :: binary()
  def encode_export_trace_service_request_for_test(span, opts \\ []) do
    encode_export_trace_service_request(span, opts)
  end

  defp finish_opts(start_time, status) do
    [
      start_time_unix_nano: start_time,
      end_time_unix_nano: System.system_time(:nanosecond),
      status: status
    ]
  end

  defp result_status({:error, reason}),
    do: {:error, "returned {:error, #{inspect(reason, printable_limit: 200, limit: 20)}}"}

  defp result_status(_), do: :ok

  defp safe_emit_span(name, attrs, opts) do
    _ = emit_span(name, attrs, opts)
    :ok
  rescue
    _ -> :ok
  catch
    _, _ -> :ok
  end

  defp export_payload(payload, opts) do
    endpoint =
      Keyword.get(opts, :endpoint) || System.get_env("OTLP_HTTP_ENDPOINT") || @default_endpoint

    timeout_ms = Keyword.get(opts, :timeout_ms, env_timeout_ms())
    request_fun = Keyword.get(opts, :request_fun, &default_request/4)

    headers = [
      {"content-type", "application/x-protobuf"},
      {"accept", "application/json, application/x-protobuf"}
    ]

    request_fun.(endpoint, headers, payload, timeout_ms)
  end

  defp default_request(endpoint, headers, payload, timeout_ms) do
    _ = Application.ensure_all_started(:req)

    case Req.post(endpoint,
           headers: headers,
           body: payload,
           retry: false,
           connect_options: [timeout: timeout_ms],
           receive_timeout: timeout_ms
         ) do
      {:ok, %Req.Response{status: status}} when status in 200..299 ->
        :ok

      {:ok, %Req.Response{status: status, body: body}} ->
        {:error, {:otlp_http_status, status, summarize(body)}}

      {:error, reason} ->
        {:error, {:otlp_http_request, reason}}
    end
  end

  defp env_timeout_ms do
    case System.get_env("OTLP_HTTP_TIMEOUT_MS") do
      nil ->
        @default_timeout_ms

      raw ->
        case Integer.parse(raw) do
          {value, ""} when value > 0 -> value
          _ -> @default_timeout_ms
        end
    end
  end

  defp encode_export_trace_service_request(span, opts) do
    resource =
      [
        {"service.name", Keyword.get(opts, :service_name, @default_service_name)},
        {"telemetry.sdk.language", "elixir"},
        {"telemetry.sdk.name", "symphony.tracing"},
        {"telemetry.sdk.version", app_version()}
      ]
      |> encode_key_values()
      |> encode_message()

    scope =
      [
        string_field(1, "symphony.tracing"),
        string_field(2, app_version())
      ]
      |> encode_message()

    span_message = encode_span(span)

    scope_spans =
      [
        message_field(1, scope),
        message_field(2, span_message)
      ]
      |> encode_message()

    resource_spans =
      [
        message_field(1, resource),
        message_field(2, scope_spans)
      ]
      |> encode_message()

    [message_field(1, resource_spans)]
    |> encode_message()
  end

  defp encode_span(%{
         trace_id: trace_id,
         span_id: span_id,
         name: name,
         start_time_unix_nano: start_time,
         end_time_unix_nano: end_time,
         attrs: attrs,
         status: status
       }) do
    [
      bytes_field(1, trace_id),
      bytes_field(2, span_id),
      string_field(5, name),
      enum_field(6, 1),
      fixed64_field(7, start_time),
      fixed64_field(8, end_time),
      encode_key_values(attrs, 9),
      message_field(15, encode_status(status))
    ]
    |> encode_message()
  end

  defp encode_status({:error, message}) do
    [
      string_field(2, message),
      enum_field(3, 2)
    ]
    |> encode_message()
  end

  defp encode_status(:ok) do
    [
      enum_field(3, 1)
    ]
    |> encode_message()
  end

  defp normalize_status({:error, message}), do: {:error, to_string(message)}
  defp normalize_status(:error), do: {:error, "error"}
  defp normalize_status(_), do: :ok

  defp encode_key_values(attrs, field_number \\ 1) do
    attrs
    |> normalize_attrs()
    |> Enum.sort_by(fn {key, _value} -> key end)
    |> Enum.map(fn {key, value} ->
      message_field(
        field_number,
        encode_message([
          string_field(1, key),
          message_field(2, encode_any_value(value))
        ])
      )
    end)
  end

  defp encode_any_value(value) when is_binary(value), do: encode_message([string_field(1, value)])
  defp encode_any_value(value) when is_boolean(value), do: encode_message([bool_field(2, value)])

  defp encode_any_value(value) when is_integer(value) and value >= 0,
    do: encode_message([int_field(3, value)])

  defp encode_any_value(value) when is_float(value), do: encode_message([double_field(4, value)])
  defp encode_any_value(value), do: encode_message([string_field(1, to_string(value))])

  defp normalize_attrs(attrs) when is_map(attrs) do
    attrs
    |> Enum.flat_map(&normalize_attr/1)
    |> Map.new()
  end

  defp normalize_attrs(attrs) when is_list(attrs) do
    if Enum.all?(attrs, &match?({_key, _value}, &1)) do
      attrs
      |> Enum.flat_map(&normalize_attr/1)
      |> Map.new()
    else
      %{}
    end
  end

  defp normalize_attrs(_), do: %{}

  defp normalize_attr({_key, nil}), do: []

  defp normalize_attr({key, value}) do
    key = attr_key(key)

    if key == "" do
      []
    else
      [{key, attr_value(value)}]
    end
  end

  defp attr_key(key) when is_atom(key), do: Atom.to_string(key)
  defp attr_key(key) when is_binary(key), do: key
  defp attr_key(key), do: to_string(key)

  defp attr_value(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp attr_value(value) when is_atom(value), do: Atom.to_string(value)

  defp attr_value(value)
       when is_binary(value) or is_integer(value) or is_float(value) or is_boolean(value),
       do: value

  defp attr_value(value), do: inspect(value, printable_limit: 200, limit: 20)

  defp string_field(number, value), do: bytes_field(number, to_string(value))
  defp bytes_field(number, value), do: [field_key(number, 2), varint(byte_size(value)), value]
  defp message_field(number, value), do: bytes_field(number, value)
  defp enum_field(number, value), do: [field_key(number, 0), varint(value)]
  defp bool_field(number, true), do: [field_key(number, 0), <<1>>]
  defp bool_field(number, false), do: [field_key(number, 0), <<0>>]
  defp int_field(number, value), do: [field_key(number, 0), varint(value)]

  defp double_field(number, value),
    do: [field_key(number, 1), <<value::little-float-size(64)>>]

  defp fixed64_field(number, value),
    do: [field_key(number, 1), <<max(value, 0)::little-unsigned-integer-size(64)>>]

  defp field_key(number, wire_type), do: varint(number <<< 3 ||| wire_type)

  defp encode_message(fields), do: IO.iodata_to_binary(fields)

  defp varint(value) when is_integer(value) and value >= 0 and value < 128, do: <<value>>

  defp varint(value) when is_integer(value) and value >= 128 do
    <<(value &&& 0x7F) ||| 0x80>> <> varint(value >>> 7)
  end

  defp random_bytes(size) do
    _ = Application.ensure_all_started(:crypto)
    :crypto.strong_rand_bytes(size)
  end

  defp app_version do
    case Application.spec(:symphony, :vsn) do
      nil -> "0.0.1"
      version -> to_string(version)
    end
  end

  defp summarize(body) do
    body
    |> inspect(printable_limit: 200, limit: 20)
    |> String.slice(0, 500)
  end
end
