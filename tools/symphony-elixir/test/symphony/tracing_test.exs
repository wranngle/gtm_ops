defmodule Symphony.TracingTest do
  use ExUnit.Case, async: true

  alias Symphony.Tracing

  @trace_id <<1::128>>
  @span_id <<2::64>>

  test "span emits an OTLP protobuf payload and returns the wrapped result" do
    parent = self()

    request_fun = fn endpoint, headers, body, timeout_ms ->
      send(parent, {:otlp_request, endpoint, headers, body, timeout_ms})
      :ok
    end

    result =
      Tracing.span(
        "unit.success",
        %{"issue.identifier" => "TRACE-1", "user.journey" => "unit"},
        fn -> {:ok, :done} end,
        trace_id: @trace_id,
        span_id: @span_id,
        endpoint: "http://example.invalid/v1/traces",
        timeout_ms: 123,
        request_fun: request_fun
      )

    assert result == {:ok, :done}
    assert_receive {:otlp_request, "http://example.invalid/v1/traces", headers, body, 123}
    assert {"content-type", "application/x-protobuf"} in headers
    assert binary_contains?(body, "unit.success")
    assert binary_contains?(body, "TRACE-1")
    assert binary_contains?(body, "wranngle-local-symphony")
  end

  test "returned error tuples are exported as error spans without changing the result" do
    parent = self()

    request_fun = fn _endpoint, _headers, body, _timeout_ms ->
      send(parent, {:otlp_body, body})
      :ok
    end

    result =
      Tracing.span(
        "unit.error_tuple",
        %{"issue.identifier" => "TRACE-ERR"},
        fn -> {:error, :bad_thing} end,
        trace_id: @trace_id,
        span_id: @span_id,
        request_fun: request_fun
      )

    assert result == {:error, :bad_thing}
    assert_receive {:otlp_body, body}
    assert binary_contains?(body, "unit.error_tuple")
    assert binary_contains?(body, "returned {:error, :bad_thing}")
  end

  test "raised exceptions emit failure attributes and are re-raised" do
    parent = self()

    request_fun = fn _endpoint, _headers, body, _timeout_ms ->
      send(parent, {:otlp_body, body})
      :ok
    end

    assert_raise RuntimeError, "boom", fn ->
      Tracing.span(
        "unit.raise",
        %{"issue.identifier" => "TRACE-RAISE"},
        fn -> raise "boom" end,
        trace_id: @trace_id,
        span_id: @span_id,
        request_fun: request_fun
      )
    end

    assert_receive {:otlp_body, body}
    assert binary_contains?(body, "unit.raise")
    assert binary_contains?(body, "exception.message")
    assert binary_contains?(body, "boom")
  end

  test "span ignores exporter failures while emit_span surfaces them" do
    request_fun = fn _endpoint, _headers, _body, _timeout_ms -> {:error, :offline} end

    assert :work_done =
             Tracing.span(
               "unit.best_effort",
               %{},
               fn -> :work_done end,
               trace_id: @trace_id,
               span_id: @span_id,
               request_fun: request_fun
             )

    assert {:error, :offline} =
             Tracing.emit_span("unit.best_effort", %{},
               trace_id: @trace_id,
               span_id: @span_id,
               request_fun: request_fun
             )
  end

  test "emit_smoke_span carries the smoke marker attribute" do
    parent = self()

    request_fun = fn _endpoint, _headers, body, _timeout_ms ->
      send(parent, {:otlp_body, body})
      :ok
    end

    assert :ok =
             Tracing.emit_smoke_span("smoke-trace-test",
               trace_id: @trace_id,
               span_id: @span_id,
               request_fun: request_fun
             )

    assert_receive {:otlp_body, body}
    assert binary_contains?(body, "symphony.trace_smoke")
    assert binary_contains?(body, "smoke.marker")
    assert binary_contains?(body, "smoke-trace-test")
  end

  defp binary_contains?(body, needle) do
    :binary.match(body, needle) != :nomatch
  end
end
