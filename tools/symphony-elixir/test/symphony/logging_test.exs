defmodule Symphony.LoggingTest do
  use ExUnit.Case, async: false

  alias Symphony.Logging
  alias Symphony.Logging.Sink

  setup do
    on_exit(fn ->
      case GenServer.whereis(Sink) do
        nil -> :ok
        pid -> GenServer.stop(pid)
      end
    end)

    :ok
  end

  test "emit writes one JSON line per event to stderr by default" do
    captured =
      ExUnit.CaptureIO.capture_io(:standard_error, fn ->
        Logging.emit(:info, "symphony.test", :success,
          message: "hello",
          issue: "WGTE-1",
          fields: %{foo: "bar"}
        )
      end)

    [line] = String.split(captured, "\n", trim: true)
    event = Jason.decode!(line)
    assert event["log.level"] == "info"
    assert event["event.action"] == "symphony.test"
    assert event["event.outcome"] == "success"
    assert event["service.name"] == "wranngle-local-symphony"
    assert event["issue.identifier"] == "WGTE-1"
    assert event["message"] == "hello"
    assert event["foo"] == "bar"
    assert is_binary(event["@timestamp"])
  end

  test "emit threads issue.id and session.id when provided (spec § 13.1)" do
    captured =
      ExUnit.CaptureIO.capture_io(:standard_error, fn ->
        Logging.emit(:info, "symphony.session.event", :success,
          issue: "WGTE-2",
          issue_id: "id-abc-123",
          session_id: "thread-xyz-turn-1",
          message: "started"
        )
      end)

    [line] = String.split(captured, "\n", trim: true)
    event = Jason.decode!(line)
    assert event["issue.identifier"] == "WGTE-2"
    assert event["issue.id"] == "id-abc-123"
    assert event["session.id"] == "thread-xyz-turn-1"
  end

  test "emit omits issue.id and session.id when not provided" do
    captured =
      ExUnit.CaptureIO.capture_io(:standard_error, fn ->
        Logging.emit(:info, "symphony.basic", :success, issue: "WGTE-3")
      end)

    [line] = String.split(captured, "\n", trim: true)
    event = Jason.decode!(line)
    refute Map.has_key?(event, "issue.id")
    refute Map.has_key?(event, "session.id")
  end

  test "configure {:file, path} appends one line per event" do
    tmp = Path.join(System.tmp_dir!(), "symphony-log-#{System.unique_integer([:positive])}.jsonl")
    on_exit(fn -> File.rm(tmp) end)

    :ok = Sink.configure({:file, tmp})

    Logging.emit(:warning, "symphony.first", :success, issue: "I1")
    Logging.emit(:info, "symphony.second", :failure, issue: "I2")

    [a, b] =
      tmp
      |> File.read!()
      |> String.split("\n", trim: true)
      |> Enum.map(&Jason.decode!/1)

    assert a["event.action"] == "symphony.first"
    assert b["event.action"] == "symphony.second"
    assert b["event.outcome"] == "failure"
  end
end
