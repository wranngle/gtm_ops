defmodule Symphony.Web.Live.DashboardLive do
  @moduledoc """
  Live observability dashboard for Symphony (spec § 13.3 + § 13.6).

  Renders the live `Symphony.snapshot/0` payload — running list (with
  turn_count, token totals, last_codex_event, session_id), retrying
  list, codex_totals (token sums + seconds_running), and the latest
  rate_limit. Auto-refreshes via PubSub when the orchestrator emits
  state changes.
  """

  use Phoenix.LiveView, layout: {Symphony.Web.Layouts, :app}

  alias Symphony.Web.{ObservabilityPubSub, Presenter}

  @runtime_tick_ms 1_000

  @impl true
  def mount(_params, _session, socket) do
    socket =
      socket
      |> assign(:payload, load_payload())
      |> assign(:now, DateTime.utc_now())

    if connected?(socket) do
      _ = ObservabilityPubSub.subscribe()
      schedule_runtime_tick()
    end

    {:ok, socket}
  end

  @impl true
  def handle_info(:runtime_tick, socket) do
    schedule_runtime_tick()
    {:noreply, assign(socket, :now, DateTime.utc_now())}
  end

  def handle_info(:observability_updated, socket) do
    {:noreply,
     socket
     |> assign(:payload, load_payload())
     |> assign(:now, DateTime.utc_now())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Symphony Observability</p>
            <h1 class="hero-title">Operations Dashboard</h1>
            <p class="hero-copy">
              Current state, retry pressure, token usage, and orchestration health for the active Symphony runtime.
            </p>
          </div>

          <div class="status-stack">
            <span class="status-badge status-badge-live">
              <span class="status-badge-dot"></span>
              Live
            </span>
            <span class="status-badge status-badge-offline">
              <span class="status-badge-dot"></span>
              Offline
            </span>
          </div>
        </div>
      </header>

      <%= if @payload[:error] do %>
        <section class="error-card">
          <h2 class="error-title">Snapshot unavailable</h2>
          <p class="error-copy">
            <strong><%= @payload.error.code %>:</strong> <%= @payload.error.message %>
          </p>
        </section>
      <% else %>
        <section class="metric-grid">
          <article class="metric-card">
            <p class="metric-label">Running</p>
            <p class="metric-value numeric"><%= @payload.counts.running %></p>
            <p class="metric-detail">Active issue sessions in the current runtime.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Retrying</p>
            <p class="metric-value numeric"><%= @payload.counts.retrying %></p>
            <p class="metric-detail">Issues waiting for the next retry window.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Total tokens</p>
            <p class="metric-value numeric"><%= format_int(@payload.codex_totals.total_tokens) %></p>
            <p class="metric-detail numeric">
              In <%= format_int(@payload.codex_totals.input_tokens) %> / Out <%= format_int(@payload.codex_totals.output_tokens) %>
            </p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Runtime</p>
            <p class="metric-value numeric"><%= format_runtime_seconds(total_runtime_seconds(@payload, @now)) %></p>
            <p class="metric-detail">Total Codex runtime across completed and active sessions.</p>
          </article>

          <article class="metric-card">
            <p class="metric-label">Polling</p>
            <p class="metric-value"><%= polling_status(@payload.polling) %></p>
            <p class="metric-detail numeric"><%= polling_detail(@payload.polling) %></p>
          </article>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Rate limits</h2>
              <p class="section-copy">Latest upstream rate-limit snapshot, when available.</p>
            </div>
          </div>

          <pre class="code-panel"><%= pretty_value(@payload.rate_limits) %></pre>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Running sessions</h2>
              <p class="section-copy">Active issues, last known agent activity, and token usage.</p>
            </div>
          </div>

          <%= if @payload.running == [] do %>
            <p class="empty-state">No active sessions.</p>
          <% else %>
            <div class="table-wrap">
              <table class="data-table data-table-running">
                <colgroup>
                  <col style="width: 12rem;" />
                  <col style="width: 8rem;" />
                  <col style="width: 7.5rem;" />
                  <col style="width: 8.5rem;" />
                  <col />
                  <col style="width: 10rem;" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>State</th>
                    <th>Session</th>
                    <th>Runtime / turns</th>
                    <th>Codex update</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  <tr :for={entry <- @payload.running}>
                    <td>
                      <div class="issue-stack">
                        <span class="issue-id"><%= entry.issue_identifier %></span>
                        <a class="issue-link" href={"/api/v1/#{entry.issue_identifier}"}>JSON details</a>
                      </div>
                    </td>
                    <td>
                      <span class={state_badge_class(entry.state)}>
                        <%= entry.state || "n/a" %>
                      </span>
                    </td>
                    <td>
                      <div class="session-stack">
                        <%= if entry.session_id do %>
                          <span class="mono"><%= short_session(entry.session_id) %></span>
                        <% else %>
                          <span class="muted">n/a</span>
                        <% end %>
                      </div>
                    </td>
                    <td class="numeric"><%= format_runtime_and_turns(entry.started_at, entry.turn_count, @now) %></td>
                    <td>
                      <div class="detail-stack">
                        <span
                          class="event-text"
                          title={entry.last_message || to_string(entry.last_event || "n/a")}
                        ><%= entry.last_message || to_string(entry.last_event || "n/a") %></span>
                        <span class="muted event-meta">
                          <%= entry.last_event || "n/a" %>
                          <%= if entry.last_event_at do %>
                            · <span class="mono numeric"><%= entry.last_event_at %></span>
                          <% end %>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div class="token-stack numeric">
                        <span>Total: <%= format_int(entry.tokens.total_tokens) %></span>
                        <span class="muted">In <%= format_int(entry.tokens.input_tokens) %> / Out <%= format_int(entry.tokens.output_tokens) %></span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          <% end %>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Retry queue</h2>
              <p class="section-copy">Issues waiting for the next retry window.</p>
            </div>
          </div>

          <%= if @payload.retrying == [] do %>
            <p class="empty-state">No issues are currently backing off.</p>
          <% else %>
            <div class="table-wrap">
              <table class="data-table" style="min-width: 680px;">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Attempt</th>
                    <th>Due at</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  <tr :for={entry <- @payload.retrying}>
                    <td>
                      <div class="issue-stack">
                        <span class="issue-id"><%= entry.issue_identifier %></span>
                        <a class="issue-link" href={"/api/v1/#{entry.issue_identifier}"}>JSON details</a>
                      </div>
                    </td>
                    <td><%= entry.attempt %></td>
                    <td class="mono"><%= entry.due_at || "n/a" %></td>
                    <td><%= entry.error || "n/a" %></td>
                  </tr>
                </tbody>
              </table>
            </div>
          <% end %>
        </section>

        <section class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Recent events</h2>
              <p class="section-copy">Humanized agent event summaries (spec § 13.6).</p>
            </div>
          </div>

          <%= if @payload.recent_events == [] do %>
            <p class="empty-state">No agent events yet.</p>
          <% else %>
            <ul class="event-list">
              <li :for={event <- @payload.recent_events} class="event-row">
                <span class="mono numeric event-row-at"><%= event.at || "n/a" %></span>
                <span class="event-row-issue"><%= event.identifier %></span>
                <span class="event-row-summary"><%= event.summary %></span>
                <span class="muted event-row-event"><%= event.event %></span>
              </li>
            </ul>
          <% end %>
        </section>
      <% end %>
    </section>
    """
  end

  defp load_payload, do: Presenter.state_payload()

  defp completed_runtime_seconds(payload), do: payload.codex_totals.seconds_running || 0

  defp total_runtime_seconds(payload, now) do
    completed_runtime_seconds(payload) +
      Enum.reduce(payload.running, 0, fn entry, total ->
        total + runtime_seconds_from_started_at(entry.started_at, now)
      end)
  end

  defp format_runtime_and_turns(started_at, turn_count, now)
       when is_integer(turn_count) and turn_count > 0 do
    "#{format_runtime_seconds(runtime_seconds_from_started_at(started_at, now))} / #{turn_count}"
  end

  defp format_runtime_and_turns(started_at, _turn_count, now),
    do: format_runtime_seconds(runtime_seconds_from_started_at(started_at, now))

  defp format_runtime_seconds(seconds) when is_number(seconds) do
    whole = max(trunc(seconds), 0)
    "#{div(whole, 60)}m #{rem(whole, 60)}s"
  end

  defp polling_status(%{checking?: true}), do: "Checking now"
  defp polling_status(_polling), do: "Waiting"

  defp polling_detail(%{next_poll_in_ms: ms}) when is_integer(ms) do
    "Next poll in #{format_poll_interval(ms)}"
  end

  defp polling_detail(%{poll_interval_ms: ms}) when is_integer(ms) do
    "Every #{format_poll_interval(ms)}"
  end

  defp polling_detail(_polling), do: "Next poll n/a"

  defp format_poll_interval(ms) when is_integer(ms) and ms >= 60_000 do
    "#{div(ms, 60_000)}m #{rem(div(ms, 1_000), 60)}s"
  end

  defp format_poll_interval(ms) when is_integer(ms), do: "#{div(max(ms, 0), 1_000)}s"

  defp runtime_seconds_from_started_at(%DateTime{} = started_at, %DateTime{} = now) do
    DateTime.diff(now, started_at, :second)
  end

  defp runtime_seconds_from_started_at(started_at, %DateTime{} = now)
       when is_binary(started_at) do
    case DateTime.from_iso8601(started_at) do
      {:ok, parsed, _} -> runtime_seconds_from_started_at(parsed, now)
      _ -> 0
    end
  end

  defp runtime_seconds_from_started_at(_started, _now), do: 0

  defp format_int(value) when is_integer(value) do
    value
    |> Integer.to_string()
    |> String.reverse()
    |> String.replace(~r/.{3}(?=.)/, "\\0,")
    |> String.reverse()
  end

  defp format_int(_), do: "n/a"

  defp state_badge_class(state) do
    base = "state-badge"
    normalized = state |> to_string() |> String.downcase()

    cond do
      String.contains?(normalized, ["progress", "running", "active"]) ->
        "#{base} state-badge-active"

      String.contains?(normalized, ["blocked", "error", "failed"]) ->
        "#{base} state-badge-danger"

      String.contains?(normalized, ["todo", "queued", "pending", "retry"]) ->
        "#{base} state-badge-warning"

      true ->
        base
    end
  end

  defp short_session(id) when is_binary(id) and byte_size(id) > 12,
    do: String.slice(id, 0, 12) <> "..."

  defp short_session(id) when is_binary(id), do: id
  defp short_session(_), do: "n/a"

  defp schedule_runtime_tick, do: Process.send_after(self(), :runtime_tick, @runtime_tick_ms)

  defp pretty_value(nil), do: "n/a"
  defp pretty_value(value), do: inspect(value, pretty: true, limit: :infinity)
end
