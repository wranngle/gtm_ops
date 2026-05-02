defmodule Symphony.LiveSession do
  @moduledoc """
  Domain struct for the live agent session metadata, per spec section
  4.1.6. Populated by the (future) Codex JSON-RPC adapter as it streams
  protocol messages back to the orchestrator.

  `session_id` is composed as `<thread_id>-<turn_id>` per spec § 4.2.
  Token counters track absolute thread totals (not deltas) per spec §
  13.5; `last_reported_*` fields are used to detect new tokens between
  events without double-counting.
  """

  @type t :: %__MODULE__{
          session_id: binary() | nil,
          thread_id: binary() | nil,
          turn_id: binary() | nil,
          codex_app_server_pid: binary() | nil,
          last_codex_event: binary() | nil,
          last_codex_timestamp: DateTime.t() | nil,
          last_codex_message: term(),
          codex_input_tokens: non_neg_integer(),
          codex_output_tokens: non_neg_integer(),
          codex_total_tokens: non_neg_integer(),
          last_reported_input_tokens: non_neg_integer(),
          last_reported_output_tokens: non_neg_integer(),
          last_reported_total_tokens: non_neg_integer(),
          turn_count: non_neg_integer()
        }

  defstruct session_id: nil,
            thread_id: nil,
            turn_id: nil,
            codex_app_server_pid: nil,
            last_codex_event: nil,
            last_codex_timestamp: nil,
            last_codex_message: nil,
            codex_input_tokens: 0,
            codex_output_tokens: 0,
            codex_total_tokens: 0,
            last_reported_input_tokens: 0,
            last_reported_output_tokens: 0,
            last_reported_total_tokens: 0,
            turn_count: 0

  @doc """
  Build the canonical session id from a thread id and turn id per spec
  § 4.2: `<thread_id>-<turn_id>`. Returns `nil` when either component is
  missing.
  """
  @spec compose_session_id(binary() | nil, binary() | nil) :: binary() | nil
  def compose_session_id(nil, _turn_id), do: nil
  def compose_session_id(_thread_id, nil), do: nil
  def compose_session_id(thread_id, turn_id), do: "#{thread_id}-#{turn_id}"
end
