defmodule Symphony.Tracker.Linear do
  @moduledoc """
  Linear-backed implementation of the `Symphony.Tracker` behaviour
  (spec section 11). Delegates GraphQL transport, pagination, and error
  mapping to `Symphony.Tracker.Linear.Client`; this module exists so the
  orchestrator only has to know about a single behaviour-conforming
  module per `tracker.kind`.

  Read-side behaviour callbacks (spec section 11.1) cover the
  orchestrator's polling loop. The write-side `post_comment/3` is
  carved out here as an explicit operator-audit primitive: when the
  dogfood loop transitions an issue (pickup, hand-off, close), the
  orchestrator can leave a one-line comment so a human browsing
  Linear sees who touched what when, without having to cross-reference
  workspace logs or git history.
  """

  @behaviour Symphony.Tracker

  alias Symphony.Tracker.Linear.Client

  @impl true
  def fetch_candidate_issues(config), do: Client.fetch_candidate_issues(config)

  @impl true
  def fetch_issues_by_states(config, states), do: Client.fetch_issues_by_states(config, states)

  @impl true
  def fetch_issue_states_by_ids(config, ids), do: Client.fetch_issue_states_by_ids(config, ids)

  @doc """
  Post a comment to a Linear issue. Operator-facing audit trail for
  agent-driven state transitions.

  Returns `{:ok, %{id: comment_id, url: comment_url}}` on success or an
  `{:error, reason}` tuple from `Symphony.Tracker.Linear.Client`'s
  standard error categories (spec section 11.4).
  """
  @spec post_comment(Symphony.Config.t(), binary(), binary(), keyword()) ::
          {:ok, %{id: binary(), url: binary() | nil}} | {:error, term()}
  def post_comment(config, issue_id, body, opts \\ []),
    do: Client.post_comment(config, issue_id, body, opts)

  # ============== Upstream zero/one-arg facade ==============
  # Mirrors the upstream `SymphonyElixir.Linear.Adapter` API for tests
  # and helpers that don't thread `config`. Test override:
  # `Application.put_env(:symphony, :linear_client_module, FakeClient)`.

  defp resolve_client do
    Application.get_env(:symphony, :linear_client_module, Client)
  end

  defp resolve_config do
    case Application.get_env(:symphony, :tracker_config_override) do
      %{} = c -> c
      _ -> %{resolved: %{}, raw: %{}, source_path: nil}
    end
  end

  @spec fetch_candidate_issues() :: {:ok, [term()]} | {:error, term()}
  def fetch_candidate_issues, do: resolve_client().fetch_candidate_issues(resolve_config())

  @spec fetch_issues_by_states([term()]) :: {:ok, [term()]} | {:error, term()}
  def fetch_issues_by_states(states) when is_list(states),
    do: resolve_client().fetch_issues_by_states(resolve_config(), states)

  @spec fetch_issue_states_by_ids([binary()]) :: {:ok, [term()]} | {:error, term()}
  def fetch_issue_states_by_ids(ids) when is_list(ids),
    do: resolve_client().fetch_issue_states_by_ids(resolve_config(), ids)

  @spec create_comment(binary(), binary()) :: :ok | {:error, term()}
  def create_comment(issue_id, body) when is_binary(issue_id) and is_binary(body) do
    case resolve_client() |> apply(:post_comment, [resolve_config(), issue_id, body, []]) do
      {:ok, _} -> :ok
      :ok -> :ok
      {:error, _reason} = err -> err
    end
  end

  @spec update_issue_state(binary(), binary()) :: :ok | {:error, term()}
  def update_issue_state(issue_id, state_name)
      when is_binary(issue_id) and is_binary(state_name) do
    if function_exported?(resolve_client(), :update_issue_state, 3) do
      case resolve_client() |> apply(:update_issue_state, [resolve_config(), issue_id, state_name]) do
        :ok -> :ok
        {:error, _} = err -> err
      end
    else
      :ok
    end
  end
end
