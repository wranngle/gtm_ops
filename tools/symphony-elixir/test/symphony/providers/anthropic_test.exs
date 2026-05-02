defmodule Symphony.Providers.AnthropicTest do
  use ExUnit.Case, async: true

  alias Symphony.Providers.Anthropic

  describe "build_payload (cache_control wiring)" do
    test "tags the system prompt with ephemeral cache_control by default" do
      payload =
        Anthropic.build_payload_for_test(
          [%{role: "user", content: "ping"}],
          "claude-haiku-4-5",
          system: "WORKFLOW.md contents go here"
        )

      assert payload["model"] == "claude-haiku-4-5"
      assert payload["max_tokens"] == 1024

      assert [%{"type" => "text", "text" => "WORKFLOW.md contents go here", "cache_control" => cc}] =
               payload["system"]

      assert cc == %{"type" => "ephemeral"}
    end

    test "sends a plain string when cache_system: false (no creation surcharge)" do
      payload =
        Anthropic.build_payload_for_test(
          [%{role: "user", content: "ping"}],
          "claude-opus-4-7",
          system: "small one-shot",
          cache_system: false
        )

      assert payload["system"] == "small one-shot"
    end

    test "omits the system field when no system prompt is given" do
      payload =
        Anthropic.build_payload_for_test(
          [%{role: "user", content: "ping"}],
          "claude-haiku-4-5",
          []
        )

      refute Map.has_key?(payload, "system")
    end

    test "treats an empty-string system as absent (cache breakpoint would be wasted)" do
      payload =
        Anthropic.build_payload_for_test(
          [%{role: "user", content: "ping"}],
          "claude-haiku-4-5",
          system: ""
        )

      refute Map.has_key?(payload, "system")
    end

    test "passes user/assistant messages through with string keys" do
      payload =
        Anthropic.build_payload_for_test(
          [
            %{role: "user", content: "first"},
            %{role: "assistant", content: "ack"},
            %{role: "user", content: "second"}
          ],
          "claude-haiku-4-5",
          []
        )

      assert payload["messages"] == [
               %{"role" => "user", "content" => "first"},
               %{"role" => "assistant", "content" => "ack"},
               %{"role" => "user", "content" => "second"}
             ]
    end
  end

  describe "decode_success (usage normalization)" do
    test "exposes the four token counts needed for cache hit-rate metrics" do
      body = %{
        "id" => "msg_01",
        "model" => "claude-haiku-4-5",
        "stop_reason" => "end_turn",
        "content" => [%{"type" => "text", "text" => "hi"}],
        "usage" => %{
          "input_tokens" => 12,
          "output_tokens" => 7,
          "cache_creation_input_tokens" => 5120,
          "cache_read_input_tokens" => 0
        }
      }

      assert {:ok, parsed} = Anthropic.decode_success_for_test(body)
      assert parsed.id == "msg_01"
      assert parsed.model == "claude-haiku-4-5"
      assert parsed.stop_reason == "end_turn"
      assert parsed.content == [%{"type" => "text", "text" => "hi"}]

      assert parsed.usage == %{
               input_tokens: 12,
               output_tokens: 7,
               cache_creation_input_tokens: 5120,
               cache_read_input_tokens: 0
             }
    end

    test "defaults missing cache fields to zero (first-request shape)" do
      body = %{
        "content" => [],
        "usage" => %{"input_tokens" => 10, "output_tokens" => 3}
      }

      assert {:ok, parsed} = Anthropic.decode_success_for_test(body)
      assert parsed.usage.cache_creation_input_tokens == 0
      assert parsed.usage.cache_read_input_tokens == 0
    end

    test "decodes a JSON-encoded body string" do
      body = Jason.encode!(%{"content" => [], "usage" => %{"input_tokens" => 1, "output_tokens" => 1}})
      assert {:ok, parsed} = Anthropic.decode_success_for_test(body)
      assert parsed.usage.input_tokens == 1
    end
  end

  describe "messages/2 (request_fun seam)" do
    test "wires headers, payload, and returns parsed body without touching the network" do
      stub = fn payload, headers, %{endpoint: endpoint, timeout_ms: t} ->
        send(self(), {:called, payload, headers, endpoint, t})

        {:ok,
         %{
           status: 200,
           body: %{
             "id" => "msg_42",
             "model" => "claude-haiku-4-5",
             "content" => [%{"type" => "text", "text" => "ok"}],
             "usage" => %{
               "input_tokens" => 5,
               "output_tokens" => 2,
               "cache_creation_input_tokens" => 0,
               "cache_read_input_tokens" => 800
             }
           }
         }}
      end

      assert {:ok, parsed} =
               Anthropic.messages(
                 [%{role: "user", content: "hi"}],
                 model: "claude-haiku-4-5",
                 system: "stable system prompt",
                 api_key: "test-key",
                 request_fun: stub
               )

      assert parsed.id == "msg_42"
      assert parsed.usage.cache_read_input_tokens == 800

      assert_received {:called, payload, headers, endpoint, _timeout}
      assert endpoint =~ "api.anthropic.com"

      header_map = Map.new(headers)
      assert header_map["x-api-key"] == "test-key"
      assert header_map["anthropic-version"] == "2023-06-01"
      assert header_map["content-type"] == "application/json"

      assert [%{"cache_control" => %{"type" => "ephemeral"}}] = payload["system"]
    end

    test "returns missing_anthropic_api_key when no key in opts and env unset" do
      original = System.get_env("ANTHROPIC_API_KEY")
      System.delete_env("ANTHROPIC_API_KEY")

      try do
        assert {:error, :missing_anthropic_api_key} =
                 Anthropic.messages(
                   [%{role: "user", content: "hi"}],
                   model: "claude-haiku-4-5",
                   request_fun: fn _, _, _ -> flunk("should not have been called") end
                 )
      after
        if original, do: System.put_env("ANTHROPIC_API_KEY", original)
      end
    end

    test "returns {:missing_required_option, :model} when model is omitted" do
      assert {:error, {:missing_required_option, :model}} =
               Anthropic.messages(
                 [%{role: "user", content: "hi"}],
                 api_key: "test-key",
                 request_fun: fn _, _, _ -> flunk("should not have been called") end
               )
    end

    test "surfaces non-200 responses as {:anthropic_api_status, status, body}" do
      stub = fn _, _, _ ->
        {:ok, %{status: 429, body: %{"type" => "error", "error" => %{"type" => "rate_limit_error"}}}}
      end

      assert {:error, {:anthropic_api_status, 429, _body}} =
               Anthropic.messages(
                 [%{role: "user", content: "hi"}],
                 model: "claude-haiku-4-5",
                 api_key: "test-key",
                 request_fun: stub
               )
    end

    test "surfaces transport errors as {:anthropic_api_request, reason}" do
      stub = fn _, _, _ -> {:error, :timeout} end

      assert {:error, {:anthropic_api_request, :timeout}} =
               Anthropic.messages(
                 [%{role: "user", content: "hi"}],
                 model: "claude-haiku-4-5",
                 api_key: "test-key",
                 request_fun: stub
               )
    end
  end
end
