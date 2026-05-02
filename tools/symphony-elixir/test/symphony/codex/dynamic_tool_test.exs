defmodule Symphony.Codex.DynamicToolTest do
  use ExUnit.Case, async: true

  alias Symphony.Codex.DynamicTool

  describe "tool_specs/0" do
    test "advertises the linear_graphql input contract" do
      assert [
               %{
                 "description" => description,
                 "inputSchema" => %{
                   "properties" => %{
                     "query" => _,
                     "variables" => _
                   },
                   "required" => ["query"],
                   "type" => "object"
                 },
                 "name" => "linear_graphql"
               }
             ] = DynamicTool.tool_specs()

      assert description =~ "Linear"
    end
  end

  describe "execute/3 unsupported tools" do
    test "returns failure payload with the supported tool list" do
      response = DynamicTool.execute("not_a_real_tool", %{})

      assert response["success"] == false

      assert Jason.decode!(response["output"]) == %{
               "error" => %{
                 "message" => ~s(Unsupported dynamic tool: "not_a_real_tool".),
                 "supportedTools" => ["linear_graphql"]
               }
             }

      assert response["contentItems"] == [
               %{"type" => "inputText", "text" => response["output"]}
             ]
    end

    test "handles nil tool name" do
      response = DynamicTool.execute(nil, %{})
      assert response["success"] == false
      assert Jason.decode!(response["output"])["error"]["message"] =~ "Unsupported"
    end
  end

  describe "execute/3 linear_graphql success" do
    test "returns successful GraphQL responses as tool text" do
      test_pid = self()

      response =
        DynamicTool.execute(
          "linear_graphql",
          %{
            "query" => "query Viewer { viewer { id } }",
            "variables" => %{"includeTeams" => false}
          },
          linear_client: fn query, variables, opts ->
            send(test_pid, {:linear_client_called, query, variables, opts})
            {:ok, %{"data" => %{"viewer" => %{"id" => "usr_123"}}}}
          end
        )

      assert_received {:linear_client_called, "query Viewer { viewer { id } }",
                       %{"includeTeams" => false}, _opts}

      assert response["success"] == true
      assert Jason.decode!(response["output"]) == %{"data" => %{"viewer" => %{"id" => "usr_123"}}}

      assert response["contentItems"] == [
               %{"type" => "inputText", "text" => response["output"]}
             ]
    end

    test "accepts a raw GraphQL query string and trims whitespace" do
      test_pid = self()

      response =
        DynamicTool.execute(
          "linear_graphql",
          "  query Viewer { viewer { id } }  ",
          linear_client: fn query, variables, _opts ->
            send(test_pid, {:linear_client_called, query, variables})
            {:ok, %{"data" => %{}}}
          end
        )

      assert_received {:linear_client_called, "query Viewer { viewer { id } }", %{}}
      assert response["success"] == true
    end
  end

  describe "execute/3 linear_graphql validation errors" do
    test "rejects blank raw query strings" do
      response = DynamicTool.execute("linear_graphql", "   ")

      assert response["success"] == false

      assert Jason.decode!(response["output"]) == %{
               "error" => %{
                 "message" => "`linear_graphql` requires a non-empty `query` string."
               }
             }
    end

    test "rejects missing query in object form" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"variables" => %{"x" => 1}},
          linear_client: fn _, _, _ -> flunk("client should not be called") end
        )

      assert response["success"] == false
      assert Jason.decode!(response["output"])["error"]["message"] =~ "non-empty"
    end

    test "rejects invalid argument types" do
      response =
        DynamicTool.execute("linear_graphql", [:not, :valid],
          linear_client: fn _, _, _ -> flunk("client should not be called") end
        )

      assert response["success"] == false
      assert Jason.decode!(response["output"])["error"]["message"] =~ "object with `query`"
    end

    test "rejects invalid variables (non-object)" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query { ok }", "variables" => ["bad"]},
          linear_client: fn _, _, _ -> flunk("client should not be called") end
        )

      assert response["success"] == false
      assert Jason.decode!(response["output"])["error"]["message"] =~ "JSON object"
    end
  end

  describe "execute/3 linear_graphql GraphQL-level errors" do
    test "marks GraphQL error responses as failures while preserving the body" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "mutation BadMutation { nope }"},
          linear_client: fn _, _, _ ->
            {:ok, %{"errors" => [%{"message" => "Unknown field `nope`"}], "data" => nil}}
          end
        )

      assert response["success"] == false

      assert Jason.decode!(response["output"]) == %{
               "data" => nil,
               "errors" => [%{"message" => "Unknown field `nope`"}]
             }
    end

    test "marks atom-key GraphQL error responses as failures" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query Viewer { viewer { id } }"},
          linear_client: fn _, _, _ -> {:ok, %{errors: [%{message: "boom"}], data: nil}} end
        )

      assert response["success"] == false
    end
  end

  describe "execute/3 linear_graphql transport errors" do
    test "formats missing-token failures" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query Viewer { viewer { id } }"},
          linear_client: fn _, _, _ -> {:error, :missing_linear_api_token} end
        )

      assert response["success"] == false
      assert Jason.decode!(response["output"])["error"]["message"] =~ "Linear auth"
    end

    test "formats HTTP status failures" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query Viewer { viewer { id } }"},
          linear_client: fn _, _, _ -> {:error, {:linear_api_status, 503}} end
        )

      assert response["success"] == false

      assert Jason.decode!(response["output"]) == %{
               "error" => %{
                 "message" => "Linear GraphQL request failed with HTTP 503.",
                 "status" => 503
               }
             }
    end

    test "formats request-level failures" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query Viewer { viewer { id } }"},
          linear_client: fn _, _, _ -> {:error, {:linear_api_request, :timeout}} end
        )

      assert response["success"] == false

      assert Jason.decode!(response["output"]) == %{
               "error" => %{
                 "message" =>
                   "Linear GraphQL request failed before receiving a successful response.",
                 "reason" => ":timeout"
               }
             }
    end

    test "formats unexpected client failures" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query Viewer { viewer { id } }"},
          linear_client: fn _, _, _ -> {:error, :boom} end
        )

      assert response["success"] == false

      assert Jason.decode!(response["output"]) == %{
               "error" => %{
                 "message" => "Linear GraphQL tool execution failed.",
                 "reason" => ":boom"
               }
             }
    end
  end

  describe "execute/3 linear_graphql edge cases" do
    test "falls back to inspect for non-JSON payloads" do
      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query { ok }"},
          linear_client: fn _, _, _ -> {:ok, :ok} end
        )

      assert response["success"] == true
      assert response["output"] == ":ok"
    end

    test "ignores legacy operationName arguments" do
      test_pid = self()

      response =
        DynamicTool.execute(
          "linear_graphql",
          %{"query" => "query Viewer { viewer { id } }", "operationName" => "Viewer"},
          linear_client: fn query, variables, _opts ->
            send(test_pid, {:linear_client_called, query, variables})
            {:ok, %{"data" => %{}}}
          end
        )

      assert_received {:linear_client_called, "query Viewer { viewer { id } }", %{}}
      assert response["success"] == true
    end
  end
end
