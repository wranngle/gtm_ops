defmodule Symphony.PromptRendererTest do
  use ExUnit.Case, async: true

  alias Symphony.{PromptRenderer, Tracker}

  test "substitutes known issue fields" do
    issue = %Tracker.Issue{
      id: "abc",
      identifier: "WGTE-001",
      title: "Hello",
      description: "Body text.",
      state: "todo",
      priority: 1,
      labels: ["a", "b"]
    }

    template = """
    Issue: {{ issue.identifier }}
    Title: {{ issue.title }}
    State: {{ issue.state }}
    Priority: {{ issue.priority }}
    Labels: {{ issue.labels }}

    {{ issue.description }}
    """

    {:ok, rendered} = PromptRenderer.render(%{template: template, issue: issue})
    assert rendered =~ "Issue: WGTE-001"
    assert rendered =~ "Priority: 1"
    assert rendered =~ "Labels: a, b"
    assert rendered =~ "Body text."
  end

  test "renders attempt when provided and empty when nil" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "t", state: "todo"}
    template = "Attempt: {{ attempt }}\n"

    {:ok, with_attempt} = PromptRenderer.render(%{template: template, issue: issue, attempt: 3})
    assert with_attempt == "Attempt: 3\n"

    {:ok, without_attempt} = PromptRenderer.render(%{template: template, issue: issue})
    assert without_attempt == "Attempt: \n"
  end

  test "rejects unknown variables strictly" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "t", state: "todo"}

    assert {:error, {:template_render_error, {:unknown_variable, "issue.bogus"}}} =
             PromptRenderer.render(%{template: "{{ issue.bogus }}", issue: issue})
  end

  test "tolerates whitespace inside braces" do
    issue = %Tracker.Issue{id: "a", identifier: "ID", title: "t", state: "s"}
    {:ok, rendered} = PromptRenderer.render(%{template: "{{   issue.identifier   }}", issue: issue})
    assert rendered == "ID"
  end
end
