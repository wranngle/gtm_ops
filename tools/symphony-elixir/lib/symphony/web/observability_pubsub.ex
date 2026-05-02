defmodule Symphony.Web.ObservabilityPubSub do
  @moduledoc """
  PubSub helpers for observability dashboard updates.

  Tolerates a missing pubsub server so callers don't need to gate on
  `dashboard_enabled?` — when the dashboard is off, broadcast is a no-op.
  """

  @pubsub Symphony.PubSub
  @topic "observability:dashboard"
  @update_message :observability_updated

  @spec topic() :: String.t()
  def topic, do: @topic

  @spec update_message() :: atom()
  def update_message, do: @update_message

  @spec subscribe() :: :ok | {:error, term()}
  def subscribe do
    case Process.whereis(@pubsub) do
      pid when is_pid(pid) -> Phoenix.PubSub.subscribe(@pubsub, @topic)
      _ -> {:error, :pubsub_unavailable}
    end
  end

  @spec broadcast_update() :: :ok
  def broadcast_update, do: broadcast_update(@pubsub)

  @spec broadcast_update(atom() | pid()) :: :ok
  def broadcast_update(pubsub) when is_pid(pubsub) do
    Phoenix.PubSub.broadcast(pubsub, @topic, @update_message)
    :ok
  rescue
    _ -> :ok
  end

  def broadcast_update(pubsub_name) when is_atom(pubsub_name) do
    case Process.whereis(pubsub_name) do
      pid when is_pid(pid) ->
        Phoenix.PubSub.broadcast(pubsub_name, @topic, @update_message)
        :ok

      _ ->
        :ok
    end
  end
end
