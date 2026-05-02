defmodule Symphony.ObservabilityPubSubTest do
  use Symphony.TestSupport

  alias Symphony.Web.ObservabilityPubSub

  test "subscribe and broadcast_update deliver dashboard updates" do
    assert :ok = ObservabilityPubSub.subscribe()
    assert :ok = ObservabilityPubSub.broadcast_update()
    assert_receive :observability_updated
  end

  # In our test_helper.exs lifecycle Phoenix.PubSub is started outside of
  # `Symphony.Supervisor` and link-owned by the test runner, so upstream's
  # version of this test (which terminates the pubsub child of
  # `Symphony.Supervisor`) doesn't apply. We instead point the broadcaster
  # at a name that is guaranteed not to be registered, exercising the
  # same defensive contract: `broadcast_update/1` must return `:ok` when
  # the pubsub server is missing.
  test "broadcast_update is a no-op when pubsub is unavailable" do
    refute Process.whereis(:symphony_test_missing_pubsub)
    assert :ok = ObservabilityPubSub.broadcast_update(:symphony_test_missing_pubsub)
  end
end
