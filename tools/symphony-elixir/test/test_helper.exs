ExUnit.start()

# The optional Phoenix LiveView dashboard (spec § 13.3, § 13.6) is
# normally OFF in :test (see config/test.exs `dashboard_enabled?: false`).
# Tests that exercise the web surface (`Symphony.WebCase`) need a stable,
# long-lived endpoint and pubsub server — starting them under each test's
# process leaks ETS tables when the test process dies.
#
# We boot them ONCE here, outside the ExUnit test pool, so they live for
# the entire test run. The persistence is the key: test cleanup hooks no
# longer get to kill the endpoint. The HttpServer test still verifies
# its public surface but no longer assumes ownership of the endpoint
# lifecycle.
unless Process.whereis(Symphony.PubSub) do
  {:ok, _} = Phoenix.PubSub.Supervisor.start_link(name: Symphony.PubSub)
end

unless Process.whereis(Symphony.Web.Endpoint) do
  existing = Application.get_env(:symphony, Symphony.Web.Endpoint, [])

  merged =
    existing
    |> Keyword.put(:server, false)
    |> Keyword.put(
      :secret_key_base,
      "test-secret-key-base-must-be-at-least-64-bytes-long-symphony-elixir-test-env"
    )

  Application.put_env(:symphony, Symphony.Web.Endpoint, merged)
  {:ok, _} = Symphony.Web.Endpoint.start_link()
end
