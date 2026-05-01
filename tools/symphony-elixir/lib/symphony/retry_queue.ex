defmodule Symphony.RetryQueue do
  @moduledoc """
  Pure functions for retry scheduling, per Symphony spec section 8.4.

  Backoff:

    * Normal continuation retry (after a clean worker exit) → 1_000 ms
    * Failure-driven retry → `min(10_000 * 2^(attempt - 1), agent.max_retry_backoff_ms)`

  This module is stateless. Callers (the orchestrator) hold the
  per-issue retry state map and use `next_attempt/3` to compute due
  times.
  """

  @continuation_delay_ms 1_000
  @failure_base_ms 10_000

  @type entry :: %{
          required(:issue_id) => binary(),
          required(:identifier) => binary(),
          required(:attempt) => pos_integer(),
          required(:due_at_ms) => integer(),
          required(:reason) => :continuation | :failure,
          optional(:error) => term()
        }

  @doc """
  Compute the next retry entry for an issue.

  `attempt` is 1-based; `1` is the first retry. Returns the entry map
  with `due_at_ms` already added to monotonic_now.
  """
  @spec next_attempt(map(), :continuation | :failure, keyword()) :: entry()
  def next_attempt(prior_entry, reason, opts \\ []) do
    max_backoff = Keyword.get(opts, :max_backoff_ms, 300_000)
    error = Keyword.get(opts, :error)
    now = Keyword.get(opts, :now_ms, System.monotonic_time(:millisecond))

    next_attempt_number =
      case prior_entry do
        nil -> 1
        %{attempt: n} -> n + 1
      end

    delay = compute_delay(reason, next_attempt_number, max_backoff)

    %{
      issue_id: prior_entry[:issue_id] || Keyword.fetch!(opts, :issue_id),
      identifier: prior_entry[:identifier] || Keyword.fetch!(opts, :identifier),
      attempt: next_attempt_number,
      due_at_ms: now + delay,
      reason: reason,
      error: error
    }
  end

  @doc """
  Return the entries whose `due_at_ms` is in the past, given a clock.
  """
  @spec due(map(), integer()) :: [entry()]
  def due(retry_attempts, now_ms) do
    retry_attempts
    |> Map.values()
    |> Enum.filter(&(&1.due_at_ms <= now_ms))
    |> Enum.sort_by(& &1.due_at_ms)
  end

  @doc """
  Compute the backoff delay (ms) for a given attempt number and reason.

  Public for testability.
  """
  @spec compute_delay(:continuation | :failure, pos_integer(), pos_integer()) :: pos_integer()
  def compute_delay(:continuation, _attempt, _max), do: @continuation_delay_ms

  def compute_delay(:failure, attempt, max_backoff) do
    raw = @failure_base_ms * Integer.pow(2, attempt - 1)
    min(raw, max_backoff)
  end
end
