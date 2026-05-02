defmodule Symphony.Tracker.Linear.ClientTest do
  use ExUnit.Case, async: false

  alias Symphony.{Config, WorkflowLoader}
  alias Symphony.Tracker.Issue
  alias Symphony.Tracker.Linear.Client

  setup do
    tmp =
      Path.join(System.tmp_dir!(), "symphony-linear-client-#{System.unique_integer([:positive])}")

    File.mkdir_p!(tmp)

    on_exit(fn ->
      File.rm_rf!(tmp)
      Application.delete_env(:symphony, :linear_request_fun)
    end)

    {:ok, tmp: tmp}
  end

  describe "config preflight (spec section 11.4)" do
    test "missing api_key returns :missing_tracker_api_key", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: nil, project_slug: "wgte")

      assert {:error, :missing_tracker_api_key} =
               Client.fetch_issues_by_states(config, ["todo"])

      assert {:error, :missing_tracker_api_key} = Client.fetch_candidate_issues(config)
      assert {:error, :missing_tracker_api_key} = Client.fetch_issue_states_by_ids(config, ["x"])
    end

    test "missing project_slug returns :missing_tracker_project_slug", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: nil)

      assert {:error, :missing_tracker_project_slug} =
               Client.fetch_issues_by_states(config, ["todo"])

      assert {:error, :missing_tracker_project_slug} = Client.fetch_candidate_issues(config)
    end

    test "empty state list short-circuits to {:ok, []}", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      assert {:ok, []} = Client.fetch_issues_by_states(config, [])
      assert {:ok, []} = Client.fetch_issues_by_states(config, ["", "  "])
    end

    test "empty id list returns {:ok, %{}}", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      assert {:ok, %{}} = Client.fetch_issue_states_by_ids(config, [])
    end
  end

  describe "graphql/4 transport with injected request_fun" do
    test "200 with valid body returns decoded payload and uses Authorization header", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      request_fun = fn payload, headers, opts ->
        send(self(), {:linear_request, payload, headers, opts})
        {:ok, %{status: 200, body: %{"data" => %{"viewer" => %{"id" => "u-1"}}}}}
      end

      assert {:ok, %{"data" => %{"viewer" => %{"id" => "u-1"}}}} =
               Client.graphql(config, "query { viewer { id } }", %{}, request_fun: request_fun)

      assert_received {:linear_request, payload, headers, opts}
      assert payload["query"] == "query { viewer { id } }"
      assert payload["variables"] == %{}
      refute Map.has_key?(payload, "operationName")
      assert {"Authorization", "lin_xxx"} in headers
      assert {"Content-Type", "application/json"} in headers
      assert opts.endpoint == "https://api.linear.app/graphql"
      assert opts.timeout_ms == 30_000
    end

    test "operation_name is included when provided", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      request_fun = fn payload, _headers, _opts ->
        send(self(), {:capture, payload})
        {:ok, %{status: 200, body: %{"data" => %{}}}}
      end

      Client.graphql(config, "q", %{}, request_fun: request_fun, operation_name: "OpName")
      assert_received {:capture, payload}
      assert payload["operationName"] == "OpName"
    end

    test "non-200 status maps to {:linear_api_status, status}", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      request_fun = fn _, _, _ -> {:ok, %{status: 502, body: "bad gateway"}} end

      assert {:error, {:linear_api_status, 502}} =
               Client.graphql(config, "q", %{}, request_fun: request_fun)
    end

    test "transport error maps to {:linear_api_request, reason}", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      request_fun = fn _, _, _ -> {:error, :nxdomain} end

      assert {:error, {:linear_api_request, :nxdomain}} =
               Client.graphql(config, "q", %{}, request_fun: request_fun)
    end

    test "Application env :linear_request_fun is honored when no per-call override", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn _, _, _ ->
        {:ok, %{status: 200, body: %{"data" => %{"hello" => "world"}}}}
      end)

      assert {:ok, %{"data" => %{"hello" => "world"}}} =
               Client.graphql(config, "q", %{})
    end
  end

  describe "fetch_issues_by_states pagination (spec section 11.2)" do
    test "merges multi-page results in tracker order", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn payload, _headers, _opts ->
        case Process.get(:linear_calls, 0) do
          0 ->
            assert payload["variables"][:after] == nil
            assert payload["variables"][:projectSlug] == "wgte"
            assert payload["variables"][:stateNames] == ["todo"]
            assert payload["variables"][:first] == 50
            Process.put(:linear_calls, 1)
            {:ok, %{status: 200, body: page_one()}}

          1 ->
            assert payload["variables"][:after] == "cursor-A"
            Process.put(:linear_calls, 2)
            {:ok, %{status: 200, body: page_two()}}
        end
      end)

      assert {:ok, issues} = Client.fetch_issues_by_states(config, ["todo"])
      assert Process.get(:linear_calls) == 2
      assert Enum.map(issues, & &1.identifier) == ["WGTE-1", "WGTE-2", "WGTE-3"]
      assert Enum.map(issues, & &1.state) == ["todo", "todo", "in_progress"]
      assert hd(issues).labels == ["backend"]
    end

    test "fetch_candidate_issues uses tracker.active_states by default", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn payload, _, _ ->
        send(self(), {:vars, payload["variables"]})

        {:ok,
         %{
           status: 200,
           body: %{
             "data" => %{
               "issues" => %{
                 "nodes" => [],
                 "pageInfo" => %{"hasNextPage" => false, "endCursor" => nil}
               }
             }
           }
         }}
      end)

      assert {:ok, []} = Client.fetch_candidate_issues(config)
      assert_received {:vars, vars}
      assert Enum.sort(vars[:stateNames]) == ["in_progress", "todo"]
    end

    test "missing endCursor mid-pagination surfaces :linear_missing_end_cursor", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn _, _, _ ->
        body = %{
          "data" => %{
            "issues" => %{
              "nodes" => [],
              "pageInfo" => %{"hasNextPage" => true, "endCursor" => nil}
            }
          }
        }

        {:ok, %{status: 200, body: body}}
      end)

      assert {:error, :linear_missing_end_cursor} =
               Client.fetch_issues_by_states(config, ["todo"])
    end

    test "graphql errors surface as {:linear_graphql_errors, errors}", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      errors = [%{"message" => "Variable $projectSlug missing"}]

      Application.put_env(:symphony, :linear_request_fun, fn _, _, _ ->
        {:ok, %{status: 200, body: %{"errors" => errors}}}
      end)

      assert {:error, {:linear_graphql_errors, ^errors}} =
               Client.fetch_issues_by_states(config, ["todo"])
    end

    test "unknown payload surfaces :linear_unknown_payload", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn _, _, _ ->
        {:ok, %{status: 200, body: %{"data" => %{}}}}
      end)

      assert {:error, :linear_unknown_payload} =
               Client.fetch_issues_by_states(config, ["todo"])
    end

    test "transport failure during pagination propagates", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn _, _, _ ->
        {:error, :timeout}
      end)

      assert {:error, {:linear_api_request, :timeout}} =
               Client.fetch_issues_by_states(config, ["todo"])
    end
  end

  describe "fetch_issue_states_by_ids" do
    test "returns id => state map for matching issues", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn payload, _, _ ->
        # Sanity check we are using the by-IDs query, not the candidate query.
        assert payload["query"] =~ "SymphonyLinearIssuesById"
        assert payload["variables"][:ids] == ["uuid-1", "uuid-2"]
        assert payload["variables"][:first] == 2

        body = %{
          "data" => %{
            "issues" => %{
              "nodes" => [
                node_full("uuid-1", "WGTE-1", "in_progress", []),
                node_full("uuid-2", "WGTE-2", "done", [])
              ]
            }
          }
        }

        {:ok, %{status: 200, body: body}}
      end)

      assert {:ok, states} = Client.fetch_issue_states_by_ids(config, ["uuid-1", "uuid-2"])
      assert states == %{"uuid-1" => "in_progress", "uuid-2" => "done"}
    end

    test "deduplicates ids before issuing the query", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      Application.put_env(:symphony, :linear_request_fun, fn payload, _, _ ->
        send(self(), {:vars, payload["variables"]})

        {:ok,
         %{
           status: 200,
           body: %{"data" => %{"issues" => %{"nodes" => []}}}
         }}
      end)

      assert {:ok, %{}} =
               Client.fetch_issue_states_by_ids(config, ["uuid-1", "uuid-1", "uuid-2"])

      assert_received {:vars, vars}
      assert vars[:ids] == ["uuid-1", "uuid-2"]
    end
  end

  describe "post_comment/4" do
    test "preflight: empty issue_id surfaces :linear_missing_issue_id", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      assert {:error, :linear_missing_issue_id} = Client.post_comment(config, "", "hi")
    end

    test "preflight: blank body surfaces :linear_empty_comment_body", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      assert {:error, :linear_empty_comment_body} =
               Client.post_comment(config, "uuid-1", "  \n  ")
    end

    test "preflight: missing api_key surfaces :missing_tracker_api_key", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: nil, project_slug: "wgte")
      assert {:error, :missing_tracker_api_key} = Client.post_comment(config, "uuid-1", "hello")
    end

    test "successful mutation returns {:ok, %{id, url}} and uses commentCreate input", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      request_fun = fn payload, headers, _opts ->
        send(self(), {:capture, payload, headers})

        {:ok,
         %{
           status: 200,
           body: %{
             "data" => %{
               "commentCreate" => %{
                 "success" => true,
                 "comment" => %{
                   "id" => "comment-uuid-1",
                   "url" => "https://linear.app/example/issue/WGTE-1#comment-comment"
                 }
               }
             }
           }
         }}
      end

      assert {:ok, %{id: "comment-uuid-1", url: url}} =
               Client.post_comment(config, "issue-uuid-1", "dogfood-loop tick @ 2026-05-01",
                 request_fun: request_fun
               )

      assert url =~ "comment-comment"

      assert_received {:capture, payload, headers}
      assert payload["operationName"] == "SymphonyLinearCommentCreate"
      assert payload["query"] =~ "commentCreate"
      assert payload["variables"][:input]["issueId"] == "issue-uuid-1"
      assert payload["variables"][:input]["body"] == "dogfood-loop tick @ 2026-05-01"
      assert payload["variables"][:input]["doNotSubscribeToIssue"] == true
      assert {"Authorization", "lin_xxx"} in headers
    end

    test "do_not_subscribe: false flips the input flag", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      request_fun = fn payload, _headers, _opts ->
        send(self(), {:capture, payload})

        {:ok,
         %{
           status: 200,
           body: %{
             "data" => %{
               "commentCreate" => %{
                 "success" => true,
                 "comment" => %{"id" => "c-1", "url" => nil}
               }
             }
           }
         }}
      end

      assert {:ok, _} =
               Client.post_comment(config, "issue-uuid-1", "x",
                 request_fun: request_fun,
                 do_not_subscribe: false
               )

      assert_received {:capture, payload}
      assert payload["variables"][:input]["doNotSubscribeToIssue"] == false
    end

    test "GraphQL errors propagate as {:linear_graphql_errors, errors}", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")
      errors = [%{"message" => "Issue not found"}]

      request_fun = fn _, _, _ ->
        {:ok, %{status: 200, body: %{"errors" => errors}}}
      end

      assert {:error, {:linear_graphql_errors, ^errors}} =
               Client.post_comment(config, "issue-uuid-1", "hi", request_fun: request_fun)
    end

    test "success: false without errors surfaces :linear_comment_create_failed", %{tmp: tmp} do
      config = workflow_config(tmp, api_key: "lin_xxx", project_slug: "wgte")

      request_fun = fn _, _, _ ->
        {:ok,
         %{
           status: 200,
           body: %{
             "data" => %{
               "commentCreate" => %{"success" => false, "comment" => nil}
             }
           }
         }}
      end

      assert {:error, {:linear_comment_create_failed, _}} =
               Client.post_comment(config, "issue-uuid-1", "hi", request_fun: request_fun)
    end

    test "decode_comment_create_for_test/1 covers happy + unknown payload" do
      assert {:ok, %{id: "c-1", url: "https://example/c"}} =
               Client.decode_comment_create_for_test(%{
                 "data" => %{
                   "commentCreate" => %{
                     "success" => true,
                     "comment" => %{"id" => "c-1", "url" => "https://example/c"}
                   }
                 }
               })

      assert {:error, :linear_unknown_payload} =
               Client.decode_comment_create_for_test(%{"data" => %{}})
    end
  end

  describe "test seams" do
    test "next_page_cursor_for_test/1 covers all pagination branches" do
      assert :done = Client.next_page_cursor_for_test(%{has_next_page: false, end_cursor: nil})

      assert {:ok, "cur-1"} =
               Client.next_page_cursor_for_test(%{has_next_page: true, end_cursor: "cur-1"})

      assert {:error, :linear_missing_end_cursor} =
               Client.next_page_cursor_for_test(%{has_next_page: true, end_cursor: nil})
    end

    test "decode_response_for_test/1 surfaces graphql errors and unknown shapes" do
      assert {:error, {:linear_graphql_errors, [%{"message" => "x"}]}} =
               Client.decode_response_for_test(%{"errors" => [%{"message" => "x"}]})

      assert {:error, :linear_unknown_payload} =
               Client.decode_response_for_test(%{"random" => "shape"})

      assert {:ok, [%Issue{identifier: "WGTE-1"}]} =
               Client.decode_response_for_test(%{
                 "data" => %{"issues" => %{"nodes" => [node_full("u1", "WGTE-1", "todo", [])]}}
               })
    end

    test "normalize_issue_for_test/1 round-trips through the public seam" do
      payload = node_full("u1", "WGTE-1", "todo", ["X"])
      issue = Client.normalize_issue_for_test(payload)
      assert issue.identifier == "WGTE-1"
      assert issue.labels == ["x"]
    end
  end

  # ============== Fixtures ==============

  defp workflow_config(tmp, opts) do
    workflow_path = Path.join(tmp, "WORKFLOW.md")

    api_key_yaml =
      case Keyword.get(opts, :api_key) do
        nil -> ""
        v -> "  api_key: #{v}\n"
      end

    project_slug_yaml =
      case Keyword.get(opts, :project_slug) do
        nil -> ""
        v -> "  project_slug: #{v}\n"
      end

    File.write!(workflow_path, """
    ---
    tracker:
      kind: linear
      active_states: todo,in_progress
    #{api_key_yaml}#{project_slug_yaml}agent:
      command: scripts/bin/llm.sh
    ---
    body
    """)

    {:ok, workflow} = WorkflowLoader.load(workflow_path)
    {:ok, config} = Config.from_workflow(workflow)
    config
  end

  defp page_one do
    %{
      "data" => %{
        "issues" => %{
          "nodes" => [
            node_full("uuid-1", "WGTE-1", "todo", ["backend"]),
            node_full("uuid-2", "WGTE-2", "todo", [])
          ],
          "pageInfo" => %{"hasNextPage" => true, "endCursor" => "cursor-A"}
        }
      }
    }
  end

  defp page_two do
    %{
      "data" => %{
        "issues" => %{
          "nodes" => [
            node_full("uuid-3", "WGTE-3", "in_progress", [])
          ],
          "pageInfo" => %{"hasNextPage" => false, "endCursor" => nil}
        }
      }
    }
  end

  defp node_full(id, ident, state_name, label_names) do
    %{
      "id" => id,
      "identifier" => ident,
      "title" => "Issue " <> ident,
      "description" => "body",
      "priority" => 2,
      "state" => %{"name" => state_name},
      "branchName" => "branch/" <> ident,
      "url" => "https://linear.app/example/issue/" <> ident,
      "labels" => %{"nodes" => Enum.map(label_names, &%{"name" => &1})},
      "inverseRelations" => %{"nodes" => []},
      "createdAt" => "2026-04-01T12:00:00Z",
      "updatedAt" => "2026-04-02T12:00:00Z"
    }
  end
end
