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
    Labels: {{ issue.labels | join: ", " }}

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

    {:ok, rendered} =
      PromptRenderer.render(%{template: "{{   issue.identifier   }}", issue: issue})

    assert rendered == "ID"
  end

  test "iterates issue.labels via Liquid for-loop" do
    issue = %Tracker.Issue{
      id: "a",
      identifier: "A",
      title: "t",
      state: "todo",
      labels: ["bug", "urgent", "ai"]
    }

    template = "Labels:{% for label in issue.labels %} [{{ label }}]{% endfor %}\n"

    {:ok, rendered} = PromptRenderer.render(%{template: template, issue: issue})
    assert rendered == "Labels: [bug] [urgent] [ai]\n"
  end

  test "iterates issue.blocked_by via Liquid for-loop" do
    issue = %Tracker.Issue{
      id: "a",
      identifier: "A",
      title: "t",
      state: "todo",
      blocked_by: [
        %{id: "1", identifier: "WGTE-100", state: "todo"},
        %{id: "2", identifier: "WGTE-101", state: "in_progress"}
      ]
    }

    template = """
    Blockers:
    {% for blocker in issue.blocked_by %}- {{ blocker.identifier }} ({{ blocker.state }})
    {% endfor %}
    """

    {:ok, rendered} = PromptRenderer.render(%{template: template, issue: issue})
    assert rendered =~ "WGTE-100 (todo)"
    assert rendered =~ "WGTE-101 (in_progress)"
  end

  test "applies the upcase filter on issue.title" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "Hello World", state: "todo"}

    template = "Title: {{ issue.title | upcase }}\n"

    {:ok, rendered} = PromptRenderer.render(%{template: template, issue: issue})
    assert rendered == "Title: HELLO WORLD\n"
  end

  test "applies the default filter when a value is nil" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "t", state: "todo", description: nil}

    # description is normalized to "" by the renderer; the default filter
    # would only fire for nil. Use branch_name which is preserved as nil.
    issue = %{issue | branch_name: nil}

    template = "Branch: {{ issue.branch_name | default: \"main\" }}\n"

    {:ok, rendered} = PromptRenderer.render(%{template: template, issue: issue})
    assert rendered == "Branch: main\n"
  end

  test "rejects unknown filters strictly" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "t", state: "todo"}

    assert {:error, {:template_render_error, {:unknown_filter, "no_such_filter"}}} =
             PromptRenderer.render(%{
               template: "{{ issue.title | no_such_filter }}",
               issue: issue
             })
  end

  test "surfaces template_parse_error distinctly from render errors" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "t", state: "todo"}

    # Unterminated `{% if %}` block.
    template = "{% if issue.title %}never closed"

    assert {:error, {:template_parse_error, _reason}} =
             PromptRenderer.render(%{template: template, issue: issue})
  end

  test "supports {% if %} control flow against attempt" do
    issue = %Tracker.Issue{id: "a", identifier: "A", title: "t", state: "todo"}

    template = "{% if attempt %}retry #{"{{ attempt }}"}{% else %}first run{% endif %}"

    {:ok, first_run} = PromptRenderer.render(%{template: template, issue: issue})
    assert first_run == "first run"

    {:ok, retry_run} = PromptRenderer.render(%{template: template, issue: issue, attempt: 2})
    assert retry_run == "retry 2"
  end
end
