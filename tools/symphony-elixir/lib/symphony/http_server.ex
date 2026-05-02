defmodule Symphony.HttpServer do
  @moduledoc """
  Supervised wrapper that boots the optional Phoenix observability
  endpoint (`Symphony.Web.Endpoint`) for spec § 13.3 + § 13.6.

  Returns `:ignore` when `:port` is negative (hard-disable) so the
  application supervisor can list this child unconditionally; the gate
  in `Symphony.Application` is what normally determines whether we run
  at all.

  Runtime overrides are accepted via `start_link/1` opts:

    * `:port` — TCP port (default from `:symphony, :dashboard_port`,
      env var `SYMPHONY_DASHBOARD_PORT`, then `4040`)
    * `:host` — bind address (default from `:symphony,
      :dashboard_host`, then `"127.0.0.1"`)
    * `:secret_key_base` — override the auto-generated secret (used by
      escript / single-binary deploys without a release config)
  """

  alias Symphony.Web.Endpoint

  @secret_key_bytes 48
  @default_port 4040
  @default_host "127.0.0.1"

  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :supervisor
    }
  end

  @spec start_link(keyword()) :: Supervisor.on_start() | :ignore
  def start_link(opts \\ []) do
    port = resolve_port(opts)

    cond do
      not is_integer(port) ->
        :ignore

      port < 0 ->
        :ignore

      true ->
        host = resolve_host(opts)

        with {:ok, ip} <- parse_host(host) do
          merge_endpoint_config!(ip, port, opts)
          Endpoint.start_link()
        end
    end
  end

  @doc """
  Return the bound TCP port (handy when starting on `port: 0` and
  asking the OS for a free port). Returns `nil` if the endpoint isn't
  running.
  """
  @spec bound_port() :: non_neg_integer() | nil
  def bound_port do
    case Bandit.PhoenixAdapter.server_info(Endpoint, :http) do
      {:ok, {_ip, port}} when is_integer(port) -> port
      _ -> nil
    end
  rescue
    _ -> nil
  catch
    :exit, _ -> nil
  end

  defp resolve_port(opts) do
    Keyword.get(opts, :port) ||
      env_int(System.get_env("SYMPHONY_DASHBOARD_PORT")) ||
      Application.get_env(:symphony, :dashboard_port, @default_port)
  end

  defp resolve_host(opts) do
    Keyword.get(opts, :host) ||
      System.get_env("SYMPHONY_DASHBOARD_HOST") ||
      Application.get_env(:symphony, :dashboard_host, @default_host)
  end

  defp env_int(nil), do: nil

  defp env_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {n, ""} -> n
      _ -> nil
    end
  end

  defp env_int(value) when is_integer(value), do: value
  defp env_int(_), do: nil

  defp merge_endpoint_config!(ip, port, opts) do
    existing = Application.get_env(:symphony, Endpoint, [])

    secret =
      Keyword.get(opts, :secret_key_base) ||
        Keyword.get(existing, :secret_key_base) ||
        secret_key_base()

    runtime = [
      server: true,
      http: [ip: ip, port: port],
      url: [host: format_host(ip)],
      secret_key_base: secret
    ]

    merged = Keyword.merge(existing, runtime)
    Application.put_env(:symphony, Endpoint, merged)
    :ok
  end

  defp parse_host({_, _, _, _} = ip), do: {:ok, ip}
  defp parse_host({_, _, _, _, _, _, _, _} = ip), do: {:ok, ip}

  defp parse_host(host) when is_binary(host) do
    charhost = String.to_charlist(host)

    case :inet.parse_address(charhost) do
      {:ok, ip} ->
        {:ok, ip}

      {:error, _} ->
        case :inet.getaddr(charhost, :inet) do
          {:ok, ip} -> {:ok, ip}
          {:error, _} -> :inet.getaddr(charhost, :inet6)
        end
    end
  end

  defp format_host({a, b, c, d}), do: Enum.join([a, b, c, d], ".")
  defp format_host(_), do: @default_host

  defp secret_key_base do
    Base.encode64(:crypto.strong_rand_bytes(@secret_key_bytes), padding: false)
  end
end
