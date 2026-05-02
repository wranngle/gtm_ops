defmodule Symphony.HttpServerTest do
  @moduledoc """
  Spec § 13.3: HttpServer wraps the Phoenix endpoint. Verifies the
  config-resolution + supervisor wiring without taking ownership of the
  endpoint lifecycle (which is owned by `test_helper.exs` for the
  duration of the test run, with `server: false`).
  """

  use ExUnit.Case, async: false

  alias Symphony.HttpServer

  test "child_spec/1 returns a supervisor child spec" do
    spec = HttpServer.child_spec([])
    assert spec.id == HttpServer
    assert spec.start == {HttpServer, :start_link, [[]]}
    assert spec.type == :supervisor
  end

  test "start_link/1 returns :ignore when port is negative" do
    assert HttpServer.start_link(port: -1) == :ignore
  end

  test "start_link/1 with a non-integer port is :ignore" do
    assert HttpServer.start_link(port: "not-a-port") == :ignore
  end

  test "bound_port/0 returns a valid value (or nil) without raising" do
    # The endpoint started in test_helper.exs has `server: false`, so
    # there's no Bandit listener. `bound_port/0` should return nil,
    # not raise. (In :dev/:prod with `server: true`, this returns the
    # actual TCP port assigned by the OS.)
    result = HttpServer.bound_port()
    assert is_nil(result) or is_integer(result)
  end

  test "start_link/1 detects an already-started endpoint" do
    # The global endpoint is already up; HttpServer should reach the
    # Endpoint.start_link path which returns {:error, {:already_started,
    # _}}, propagating that to the caller.
    assert {:error, {:already_started, pid}} = HttpServer.start_link(port: 0, host: "127.0.0.1")
    assert is_pid(pid)
  end
end
