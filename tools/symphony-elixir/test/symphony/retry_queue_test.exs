defmodule Symphony.RetryQueueTest do
  use ExUnit.Case, async: true

  alias Symphony.RetryQueue

  describe "compute_delay/3" do
    test "continuation is always 1 second" do
      assert RetryQueue.compute_delay(:continuation, 1, 300_000) == 1_000
      assert RetryQueue.compute_delay(:continuation, 5, 300_000) == 1_000
    end

    test "failure backoff doubles per attempt up to the cap" do
      assert RetryQueue.compute_delay(:failure, 1, 300_000) == 10_000
      assert RetryQueue.compute_delay(:failure, 2, 300_000) == 20_000
      assert RetryQueue.compute_delay(:failure, 3, 300_000) == 40_000
      assert RetryQueue.compute_delay(:failure, 4, 300_000) == 80_000
      assert RetryQueue.compute_delay(:failure, 5, 300_000) == 160_000
      # capped at max
      assert RetryQueue.compute_delay(:failure, 6, 300_000) == 300_000
      assert RetryQueue.compute_delay(:failure, 99, 300_000) == 300_000
    end

    test "respects a smaller max_backoff_ms" do
      assert RetryQueue.compute_delay(:failure, 4, 30_000) == 30_000
      assert RetryQueue.compute_delay(:failure, 1, 30_000) == 10_000
    end
  end

  describe "next_attempt/3" do
    test "first failure attempt has attempt=1 and 10s delay" do
      entry =
        RetryQueue.next_attempt(nil, :failure,
          issue_id: "1",
          identifier: "gh-1",
          now_ms: 1000
        )

      assert entry.attempt == 1
      assert entry.due_at_ms == 1000 + 10_000
      assert entry.reason == :failure
    end

    test "subsequent attempts increment and respect max" do
      first =
        RetryQueue.next_attempt(nil, :failure,
          issue_id: "9",
          identifier: "WGTE-9",
          now_ms: 0
        )

      second = RetryQueue.next_attempt(first, :failure, now_ms: 1_000)
      assert second.attempt == 2
      assert second.due_at_ms == 1_000 + 20_000
    end

    test "continuation reason has fixed 1s delay regardless of attempt" do
      first = RetryQueue.next_attempt(nil, :continuation, issue_id: "1", identifier: "1", now_ms: 0)
      assert first.due_at_ms == 1_000

      tenth = %{first | attempt: 10}
      next = RetryQueue.next_attempt(tenth, :continuation, now_ms: 0)
      assert next.due_at_ms == 1_000
      assert next.attempt == 11
    end
  end

  describe "due/2" do
    test "returns entries whose due_at_ms is past" do
      retry_map = %{
        "a" => %{issue_id: "a", identifier: "a", attempt: 1, due_at_ms: 100, reason: :failure},
        "b" => %{issue_id: "b", identifier: "b", attempt: 1, due_at_ms: 5_000, reason: :failure},
        "c" => %{issue_id: "c", identifier: "c", attempt: 1, due_at_ms: 50, reason: :failure}
      }

      assert Enum.map(RetryQueue.due(retry_map, 1_000), & &1.issue_id) == ["c", "a"]
      assert Enum.map(RetryQueue.due(retry_map, 100_000), & &1.issue_id) == ["c", "a", "b"]
      assert RetryQueue.due(retry_map, 0) == []
    end
  end
end
