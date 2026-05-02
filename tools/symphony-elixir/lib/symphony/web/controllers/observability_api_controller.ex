defmodule Symphony.Web.ObservabilityApiController do
  @moduledoc """
  JSON snapshot API for Symphony (spec § 13.3).

  Exposes the canonical snapshot at GET `/api/snapshot` (with a legacy
  alias at `/api/v1/state`). Error semantics:

    * `200 OK` — snapshot returned successfully
    * `503 Service Unavailable` — orchestrator down (`{:error,
      :unavailable}`) — body: `{"error":{"code":"unavailable",
      "message":"Snapshot unavailable"}}`
    * `504 Gateway Timeout` — snapshot call exceeded the configured
      timeout — body uses `code: "timeout"`
  """

  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias Symphony.Web.Presenter

  @spec snapshot(Conn.t(), map()) :: Conn.t()
  def snapshot(conn, _params) do
    payload = Presenter.state_payload()
    status = response_status_for(payload)

    conn
    |> put_status(status)
    |> json(payload)
  end

  @spec issue(Conn.t(), map()) :: Conn.t()
  def issue(conn, %{"issue_identifier" => identifier}) do
    case Presenter.issue_payload(identifier) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, :issue_not_found} ->
        error_response(conn, 404, "issue_not_found", "Issue not found")

      {:error, :unavailable} ->
        error_response(conn, 503, "unavailable", "Snapshot unavailable")
    end
  end

  @spec method_not_allowed(Conn.t(), map()) :: Conn.t()
  def method_not_allowed(conn, _params) do
    error_response(conn, 405, "method_not_allowed", "Method not allowed")
  end

  @spec not_found(Conn.t(), map()) :: Conn.t()
  def not_found(conn, _params) do
    error_response(conn, 404, "not_found", "Route not found")
  end

  defp response_status_for(%{error: %{code: "snapshot_timeout"}}), do: 504
  defp response_status_for(%{error: %{code: "snapshot_unavailable"}}), do: 503
  defp response_status_for(_), do: 200

  defp error_response(conn, status, code, message) do
    conn
    |> put_status(status)
    |> json(%{error: %{code: code, message: message}})
  end
end
