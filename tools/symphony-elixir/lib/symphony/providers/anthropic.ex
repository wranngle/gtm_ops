defmodule Symphony.Providers.Anthropic do
  @moduledoc """
  Direct Anthropic Messages API provider for Symphony.

  This is the first member of `Symphony.Providers.*` — the namespace
  exists so future providers (OpenAI, Google) can plug in alongside the
  existing Claude-Code-CLI shellout (`Symphony.AgentRunner.LocalShell`)
  without each adapter rolling its own HTTP client.

  ## Why a direct API path next to the CLI shellout

  The dogfood loop (`tools/dogfood/run-tick.sh`) spawns `claude -p` per
  tick. That carries the full Claude Code agent harness — fine when the
  task needs file edits and tool use, wasteful when the orchestrator
  just needs a structured completion (audit summaries, follow-up
  extraction, STACK-NNN classification, dashboard text). For those
  paths a thin Messages-API call is dramatically cheaper and
  measurable.

  ## Headline capability: prompt caching (`cache_control: ephemeral`)

  Symphony renders the WORKFLOW.md + AGENTS.md text into the system
  prompt every tick. Those bytes never change between ticks within a
  session. With `cache_control: {type: "ephemeral"}` Anthropic charges
  the cached portion at ~10% of the base input rate on cache hits,
  which is exactly the dogfood loop's per-tick read-only payload.

  The client always tags the system prompt for caching when given a
  non-empty system. The response surfaces `cache_creation_input_tokens`
  and `cache_read_input_tokens` so observability (spec § 13) can plot
  hit rates over time and verify the optimization is actually paying
  off. See https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching.

  ## Test seam

  Mirrors `Symphony.Tracker.Linear.Client`: the HTTP call is dispatched
  via a swappable `request_fun`. Tests pass a stub that returns a
  canned `%{status: 200, body: ...}` map without touching the network.
  Production uses `Req.post/2`.
  """

  require Logger

  @endpoint "https://api.anthropic.com/v1/messages"
  @api_version "2023-06-01"
  @default_max_tokens 1024
  @default_timeout_ms 120_000

  @type message :: %{required(:role) => String.t(), required(:content) => String.t()}
  @type opts :: [
          system: String.t() | nil,
          model: String.t(),
          max_tokens: pos_integer(),
          api_key: String.t() | nil,
          cache_system: boolean(),
          timeout_ms: pos_integer(),
          request_fun: (map(), list(), map() -> {:ok, map()} | {:error, term()})
        ]

  @doc """
  POST a `messages` request and return the parsed body on success.

  Required:
    * `:model` — e.g. `"claude-opus-4-7"`, `"claude-haiku-4-5"`.

  Optional:
    * `:system` — when present, sent as a single `text` block with
      `cache_control: {type: "ephemeral"}` unless `cache_system: false`.
    * `:max_tokens` — defaults to #{@default_max_tokens}.
    * `:api_key` — defaults to `System.get_env("ANTHROPIC_API_KEY")`.
    * `:cache_system` — defaults to `true`. Disabling skips the cache
      breakpoint (mostly useful when caller knows the system prompt
      will not repeat, since billed cache_creation tokens are charged
      regardless of whether anything reads them later).
    * `:timeout_ms` — connect + receive timeout, default
      #{@default_timeout_ms}.
    * `:request_fun` — test seam.

  Returns `{:ok, %{content: [...], usage: %{...}, model: ...}}` on a
  200, with usage-fields sufficient to compute cache hit rate, or
  `{:error, term}` on transport / non-2xx / decode failure.
  """
  @spec messages([message()], opts()) :: {:ok, map()} | {:error, term()}
  def messages(messages, opts) when is_list(messages) and is_list(opts) do
    with {:ok, model} <- fetch_required(opts, :model),
         {:ok, api_key} <- resolve_api_key(opts) do
      payload = build_payload(messages, model, opts)
      headers = build_headers(api_key)
      timeout_ms = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
      request_fun = Keyword.get(opts, :request_fun, &default_request/3)

      case request_fun.(payload, headers, %{endpoint: @endpoint, timeout_ms: timeout_ms}) do
        {:ok, %{status: 200, body: body}} ->
          decode_success(body)

        {:ok, %{status: status, body: body}} ->
          Logger.warning(
            "symphony.providers.anthropic.api_status status=#{status} body=#{summarize(body)}"
          )

          {:error, {:anthropic_api_status, status, body}}

        {:error, reason} ->
          Logger.warning("symphony.providers.anthropic.api_request reason=#{inspect(reason)}")
          {:error, {:anthropic_api_request, reason}}
      end
    end
  end

  # ============== Test seams ==============

  @doc false
  @spec build_payload_for_test([message()], String.t(), opts()) :: map()
  def build_payload_for_test(messages, model, opts), do: build_payload(messages, model, opts)

  @doc false
  @spec decode_success_for_test(map()) :: {:ok, map()} | {:error, term()}
  def decode_success_for_test(body), do: decode_success(body)

  # ============== Helpers ==============

  defp build_payload(messages, model, opts) do
    base = %{
      "model" => model,
      "max_tokens" => Keyword.get(opts, :max_tokens, @default_max_tokens),
      "messages" => Enum.map(messages, &normalize_message/1)
    }

    case Keyword.get(opts, :system) do
      nil ->
        base

      "" ->
        base

      system when is_binary(system) ->
        Map.put(base, "system", system_blocks(system, opts))
    end
  end

  # The cache breakpoint always lands on the system prompt — the dogfood
  # loop's invariant payload (WORKFLOW.md + AGENTS.md) lives there. If a
  # caller opts out via `cache_system: false`, we send a plain string
  # so the request does not pay the cache-creation surcharge for tokens
  # nothing will ever read back.
  defp system_blocks(system, opts) do
    if Keyword.get(opts, :cache_system, true) do
      [
        %{
          "type" => "text",
          "text" => system,
          "cache_control" => %{"type" => "ephemeral"}
        }
      ]
    else
      system
    end
  end

  defp normalize_message(%{role: role, content: content})
       when is_binary(role) and is_binary(content) do
    %{"role" => role, "content" => content}
  end

  defp normalize_message(%{"role" => role, "content" => content})
       when is_binary(role) and is_binary(content) do
    %{"role" => role, "content" => content}
  end

  defp build_headers(api_key) do
    [
      {"content-type", "application/json"},
      {"x-api-key", api_key},
      {"anthropic-version", @api_version}
    ]
  end

  defp default_request(payload, headers, %{endpoint: endpoint, timeout_ms: timeout}) do
    Req.post(endpoint,
      headers: headers,
      json: payload,
      connect_options: [timeout: timeout],
      receive_timeout: timeout
    )
  end

  defp decode_success(body) when is_map(body) do
    {:ok,
     %{
       content: Map.get(body, "content", []),
       usage: normalize_usage(Map.get(body, "usage", %{})),
       model: Map.get(body, "model"),
       stop_reason: Map.get(body, "stop_reason"),
       id: Map.get(body, "id")
     }}
  end

  defp decode_success(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> decode_success(decoded)
      {:error, reason} -> {:error, {:anthropic_decode_failure, reason}}
    end
  end

  defp decode_success(other), do: {:error, {:anthropic_unexpected_body, other}}

  # Surface the four token counts the caller needs to compute cache hit
  # rate. Defaults to 0 so downstream metrics arithmetic never crashes
  # on a missing field (the API omits cache_* counts entirely on the
  # very first request before a cache exists).
  defp normalize_usage(usage) when is_map(usage) do
    %{
      input_tokens: Map.get(usage, "input_tokens", 0),
      output_tokens: Map.get(usage, "output_tokens", 0),
      cache_creation_input_tokens: Map.get(usage, "cache_creation_input_tokens", 0),
      cache_read_input_tokens: Map.get(usage, "cache_read_input_tokens", 0)
    }
  end

  defp resolve_api_key(opts) do
    case Keyword.get(opts, :api_key) || System.get_env("ANTHROPIC_API_KEY") do
      key when is_binary(key) and byte_size(key) > 0 -> {:ok, key}
      _ -> {:error, :missing_anthropic_api_key}
    end
  end

  defp fetch_required(opts, key) do
    case Keyword.fetch(opts, key) do
      {:ok, value} when is_binary(value) and byte_size(value) > 0 -> {:ok, value}
      _ -> {:error, {:missing_required_option, key}}
    end
  end

  defp summarize(body) when is_binary(body), do: String.slice(body, 0, 400)
  defp summarize(body), do: inspect(body, limit: 5, printable_limit: 400)
end
