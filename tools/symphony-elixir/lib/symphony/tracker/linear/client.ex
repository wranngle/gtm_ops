defmodule Symphony.Tracker.Linear.Client do
  @moduledoc """
  GraphQL client for the Linear tracker. Implements spec section 11.2:

    * POSTs queries to the configured `tracker.endpoint` (default
      `https://api.linear.app/graphql`).
    * Sends `tracker.api_key` (already env-resolved by `Symphony.Config`)
      in the `Authorization` header.
    * Filters candidate issues by `project: { slugId: { eq: $projectSlug } }`
      and active states (`tracker.active_states`).
    * Issue-state refresh queries use GraphQL variable type `[ID!]`.
    * Pages candidate fetches at 50/page until `endCursor` is exhausted;
      surfaces `:linear_missing_end_cursor` mid-pagination per spec
      section 11.4.
    * Network timeout: 30 000 ms.

  Error categories (spec section 11.4):
    * `:missing_tracker_api_key`
    * `:missing_tracker_project_slug`
    * `{:linear_api_request, reason}` — transport failure
    * `{:linear_api_status, status}` — non-200 HTTP response
    * `{:linear_graphql_errors, errors}` — Linear returned `errors` field
    * `:linear_unknown_payload` — neither `data.issues` nor `errors`
    * `:linear_missing_end_cursor` — `hasNextPage=true` but `endCursor=nil`

  Tests inject a `:request_fun` callback via `graphql/3` opts so the pure
  logic (decoding, pagination, error mapping) is exercisable without
  hitting the network. See `Symphony.Tracker.Linear.ClientTest`.
  """

  require Logger

  alias Symphony.Config
  alias Symphony.Tracker.Issue
  alias Symphony.Tracker.Linear.Issue, as: Normalizer

  @issue_page_size 50
  @network_timeout_ms 30_000
  @max_error_body_log_bytes 1_000

  @candidate_query """
  query SymphonyLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
    issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
      nodes {
        id
        identifier
        title
        description
        priority
        state { name }
        branchName
        url
        labels { nodes { name } }
        inverseRelations(first: $relationFirst) {
          nodes {
            type
            issue { id identifier state { name } }
          }
        }
        createdAt
        updatedAt
      }
      pageInfo { hasNextPage endCursor }
    }
  }
  """

  @issues_by_ids_query """
  query SymphonyLinearIssuesById($ids: [ID!]!, $first: Int!, $relationFirst: Int!) {
    issues(filter: {id: {in: $ids}}, first: $first) {
      nodes {
        id
        identifier
        title
        description
        priority
        state { name }
        branchName
        url
        labels { nodes { name } }
        inverseRelations(first: $relationFirst) {
          nodes {
            type
            issue { id identifier state { name } }
          }
        }
        createdAt
        updatedAt
      }
    }
  }
  """

  # ============== Behaviour-facing entry points ==============

  @doc """
  Fetch candidate issues in `tracker.active_states` for the configured
  project. Returns a list of normalized `Symphony.Tracker.Issue` records.
  """
  @spec fetch_candidate_issues(Config.t()) :: {:ok, [Issue.t()]} | {:error, term()}
  def fetch_candidate_issues(config) do
    states = Config.tracker_active_states(config)
    fetch_issues_by_states(config, states)
  end

  @doc """
  Fetch issues in arbitrary state names (used for startup terminal cleanup
  and ad-hoc reconciliation). Empty `state_names` short-circuits to
  `{:ok, []}`.
  """
  @spec fetch_issues_by_states(Config.t(), [binary()]) ::
          {:ok, [Issue.t()]} | {:error, term()}
  def fetch_issues_by_states(config, state_names) when is_list(state_names) do
    normalized =
      state_names
      |> Enum.map(&to_string/1)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    cond do
      normalized == [] ->
        {:ok, []}

      true ->
        with {:ok, project_slug} <- require_project_slug(config),
             {:ok, _api_key} <- require_api_key(config) do
          do_fetch_by_states_page(config, project_slug, normalized, nil, [])
        end
    end
  end

  @doc """
  Refresh the current state of specific issue IDs. Returns a map of
  `id => state_name` per the `Symphony.Tracker` behaviour contract.

  Empty `ids` short-circuits to `{:ok, %{}}`.
  """
  @spec fetch_issue_states_by_ids(Config.t(), [binary()]) ::
          {:ok, %{required(binary()) => binary()}} | {:error, term()}
  def fetch_issue_states_by_ids(config, ids) when is_list(ids) do
    deduped = ids |> Enum.uniq() |> Enum.reject(&(&1 == ""))

    case deduped do
      [] ->
        {:ok, %{}}

      _ ->
        with {:ok, _api_key} <- require_api_key(config),
             {:ok, issues} <- do_fetch_issues_by_ids(config, deduped, []) do
          {:ok, Map.new(issues, fn %Issue{id: id, state: state} -> {id, state} end)}
        end
    end
  end

  @doc """
  Low-level GraphQL POST. Public so callers can extend the schema (for
  example, the optional `linear_graphql` agent tool described in spec
  section 11.5) without touching the Symphony client.

  Options:
    * `:request_fun` — `(payload, headers, opts -> {:ok, %{status, body}} | {:error, term()})`.
      Defaults to `Req.post/2`. Tests inject this to avoid real HTTP.
    * `:operation_name` — optional operation name for logs.
  """
  @spec graphql(Config.t(), String.t(), map(), keyword()) ::
          {:ok, map()} | {:error, term()}
  def graphql(config, query, variables \\ %{}, opts \\ [])
      when is_binary(query) and is_map(variables) and is_list(opts) do
    payload = build_payload(query, variables, Keyword.get(opts, :operation_name))
    request_fun = resolve_request_fun(opts)

    with {:ok, headers} <- build_headers(config),
         {:ok, %{status: 200, body: body}} <-
           request_fun.(payload, headers, request_opts(config)) do
      {:ok, body}
    else
      {:ok, %{status: status} = response} ->
        Logger.error(
          "symphony.tracker.linear.api_status status=#{status}" <>
            error_log_context(payload, response)
        )

        {:error, {:linear_api_status, status}}

      {:error, reason} ->
        Logger.error("symphony.tracker.linear.api_request reason=#{inspect(reason)}")
        {:error, {:linear_api_request, reason}}
    end
  end

  # Resolution order for the GraphQL request callback:
  #   1. Explicit `:request_fun` keyword (per-call override).
  #   2. `Application.get_env(:symphony, :linear_request_fun)` (test
  #      suite override; never set in production config).
  #   3. Default `Req.post/2` based implementation.
  defp resolve_request_fun(opts) do
    cond do
      fun = Keyword.get(opts, :request_fun) -> fun
      fun = Application.get_env(:symphony, :linear_request_fun) -> fun
      true -> &default_request/3
    end
  end

  # ============== Test seams (intentionally @doc false) ==============

  @doc false
  @spec normalize_issue_for_test(map()) :: Issue.t() | nil
  def normalize_issue_for_test(payload), do: Normalizer.from_payload(payload)

  @doc false
  @spec next_page_cursor_for_test(map()) :: {:ok, String.t()} | :done | {:error, term()}
  def next_page_cursor_for_test(page_info) when is_map(page_info), do: next_page_cursor(page_info)

  @doc false
  @spec decode_page_for_test(map()) ::
          {:ok, [Issue.t()], map()} | {:error, term()}
  def decode_page_for_test(body), do: decode_page_response(body)

  @doc false
  @spec decode_response_for_test(map()) :: {:ok, [Issue.t()]} | {:error, term()}
  def decode_response_for_test(body), do: decode_issues_response(body)

  # ============== Pagination loop ==============

  defp do_fetch_by_states_page(config, project_slug, state_names, after_cursor, acc) do
    variables = %{
      projectSlug: project_slug,
      stateNames: state_names,
      first: @issue_page_size,
      relationFirst: @issue_page_size,
      after: after_cursor
    }

    with {:ok, body} <- graphql(config, @candidate_query, variables),
         {:ok, issues, page_info} <- decode_page_response(body) do
      next_acc = Enum.reverse(issues, acc)

      case next_page_cursor(page_info) do
        :done ->
          {:ok, Enum.reverse(next_acc)}

        {:ok, next_cursor} ->
          do_fetch_by_states_page(config, project_slug, state_names, next_cursor, next_acc)

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  defp do_fetch_issues_by_ids(_config, [], acc), do: {:ok, Enum.reverse(acc)}

  defp do_fetch_issues_by_ids(config, ids, acc) do
    {batch, rest} = Enum.split(ids, @issue_page_size)

    variables = %{
      ids: batch,
      first: length(batch),
      relationFirst: @issue_page_size
    }

    with {:ok, body} <- graphql(config, @issues_by_ids_query, variables),
         {:ok, issues} <- decode_issues_response(body) do
      do_fetch_issues_by_ids(config, rest, Enum.reverse(issues, acc))
    end
  end

  # ============== Decoders ==============

  defp decode_page_response(%{
         "data" => %{
           "issues" => %{
             "nodes" => nodes,
             "pageInfo" => %{"hasNextPage" => has_next, "endCursor" => end_cursor}
           }
         }
       })
       when is_list(nodes) do
    issues = nodes |> Enum.map(&Normalizer.from_payload/1) |> Enum.reject(&is_nil/1)
    {:ok, issues, %{has_next_page: has_next == true, end_cursor: end_cursor}}
  end

  defp decode_page_response(other), do: decode_issues_response(other)

  defp decode_issues_response(%{"data" => %{"issues" => %{"nodes" => nodes}}})
       when is_list(nodes) do
    issues = nodes |> Enum.map(&Normalizer.from_payload/1) |> Enum.reject(&is_nil/1)
    {:ok, issues}
  end

  defp decode_issues_response(%{"errors" => errors}) do
    {:error, {:linear_graphql_errors, errors}}
  end

  defp decode_issues_response(_), do: {:error, :linear_unknown_payload}

  defp next_page_cursor(%{has_next_page: true, end_cursor: cursor})
       when is_binary(cursor) and byte_size(cursor) > 0,
       do: {:ok, cursor}

  defp next_page_cursor(%{has_next_page: true}), do: {:error, :linear_missing_end_cursor}
  defp next_page_cursor(_), do: :done

  # ============== Config preflight ==============

  defp require_api_key(config) do
    case Config.tracker_api_key(config) do
      key when is_binary(key) and key != "" -> {:ok, key}
      _ -> {:error, :missing_tracker_api_key}
    end
  end

  defp require_project_slug(config) do
    case Map.get(config.resolved, "tracker.project_slug") do
      slug when is_binary(slug) and slug != "" -> {:ok, slug}
      _ -> {:error, :missing_tracker_project_slug}
    end
  end

  # ============== HTTP / payload plumbing ==============

  defp build_headers(config) do
    case require_api_key(config) do
      {:ok, token} ->
        {:ok,
         [
           {"Authorization", token},
           {"Content-Type", "application/json"}
         ]}

      {:error, _} = err ->
        err
    end
  end

  defp build_payload(query, variables, operation_name) do
    base = %{"query" => query, "variables" => variables}

    case operation_name do
      name when is_binary(name) and name != "" -> Map.put(base, "operationName", name)
      _ -> base
    end
  end

  defp request_opts(config) do
    %{
      endpoint: Config.tracker_endpoint(config),
      timeout_ms: @network_timeout_ms
    }
  end

  defp default_request(payload, headers, %{endpoint: endpoint, timeout_ms: timeout}) do
    Req.post(endpoint,
      headers: headers,
      json: payload,
      connect_options: [timeout: timeout],
      receive_timeout: timeout
    )
  end

  defp error_log_context(payload, response) do
    op =
      case Map.get(payload, "operationName") do
        n when is_binary(n) and n != "" -> " operation=#{n}"
        _ -> ""
      end

    body = response |> Map.get(:body) |> summarize_body()
    op <> " body=" <> body
  end

  defp summarize_body(body) when is_binary(body) do
    body
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
    |> truncate()
    |> inspect()
  end

  defp summarize_body(body),
    do: body |> inspect(limit: 20, printable_limit: @max_error_body_log_bytes) |> truncate()

  defp truncate(b) when is_binary(b) do
    if byte_size(b) > @max_error_body_log_bytes do
      binary_part(b, 0, @max_error_body_log_bytes) <> "...<truncated>"
    else
      b
    end
  end
end
