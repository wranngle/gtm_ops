defmodule Symphony.LiveSessionTest do
  use ExUnit.Case, async: true

  alias Symphony.LiveSession

  test "compose_session_id joins thread and turn per spec § 4.2" do
    assert LiveSession.compose_session_id("th-1", "tn-1") == "th-1-tn-1"
  end

  test "compose_session_id returns nil when either component is missing" do
    assert LiveSession.compose_session_id(nil, "tn-1") == nil
    assert LiveSession.compose_session_id("th-1", nil) == nil
    assert LiveSession.compose_session_id(nil, nil) == nil
  end

  test "default struct has zeroed counters and turn_count" do
    s = %LiveSession{}
    assert s.codex_input_tokens == 0
    assert s.codex_output_tokens == 0
    assert s.codex_total_tokens == 0
    assert s.last_reported_total_tokens == 0
    assert s.turn_count == 0
  end
end
