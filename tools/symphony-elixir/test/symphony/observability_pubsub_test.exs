defmodule Symphony.ObservabilityPubSubTest do
  use Symphony.TestSupport

  alias Symphony.Web.ObservabilityPubSub

  test "subscribe and broadcast_update deliver dashboard updates" do
    assert :ok = ObservabilityPubSub.subscribe()
    assert :ok = ObservabilityPubSub.broadcast_update()
    assert_receive :observability_updated
  end

  # In our test_helper.exs lifecycle, Phoenix.PubSub is started directly via
  # `Phoenix.PubSub.Supervisor.start_link/1` outside of `Symphony.Supervisor`
  # (so a single endpoint persists across the full test run instead of being
  # owned by per-test ExUnit supervision). Upstream's variant of this test
  # terminates the pubsub child of `Symphony.Supervisor`; we instead stop the
  # standalone supervisor and restart it on exit, which exercises the same
  # invariant: `broadcast_update/0` must remain a graceful no-op when the
  # pubsub server isn't running.
  test "broadcast_update is a no-op when pubsub is unavailable" do
    pubsub_pid = Process.whereis(Symphony.PubSub)
    assert is_pid(pubsub_pid)

    on_exit(fn ->
      if Process.whereis(Symphony.PubSub) == nil do
        {:ok, _} = Phoenix.PubSub.Supervisor.start_link(name: Symphony.PubSub)
      end
    end)

    sup_pid =
      case Process.whereis(Symphony.PubSub.Supervisor) do
        sp when is_pid(sp) -> sp
        _ -> pubsub_pid
      end

    ref = Process.monitor(sup_pid)
    Process.exit(sup_pid, :shutdown)
    receive do
      {:DOWN, ^ref, :process, _, _} -> :ok
    after
      1_000 -> :ok
    end

    Enum.reduce_while(1..50, nil, fn _, _ ->
      if Process.whereis(Symphony.PubSub),
        do: {:cont, Process.sleep(20)},
        else: {:halt, :down}
    end)

    refute Process.whereis(Symphony.PubSub)

    assert :ok = ObservabilityPubSub.broadcast_update()
  end
end
