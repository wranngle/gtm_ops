defmodule Symphony.SpecsCheck do
  @moduledoc """
  Runtime spec-conformance checker.

  Walks the live module tree and asserts that the spec-mandated public
  surfaces (the ones the OpenAI Symphony spec elevates to MUST) are
  actually wired. Failures are returned as `{:error, [reason, ...]}` so
  the mix-task wrapper can print them in operator-friendly form.

  This is *not* the upstream `SpecsCheck` AST scanner that enforces
  `@spec` on every public function — we adapted that module's role to
  match what is most useful for our codebase: a behavioural assertion
  that the spec sections we reference in modules are still live.

  Checks performed (each maps back to a section in
  `docs/references/openai_symphony_original_spec.txt`):

    * § 6.3 dispatch preflight — `Symphony.Config.validate_dispatch_preflight/1`
      exists and returns `:ok` for a tracker-kind=local_markdown config.
    * § 9.4/9.5 workspace + safety — `Symphony.WorkspaceManager`
      delegates `sanitize_key/1`, `assert_inside_root!/2`,
      `assert_safe_cwd!/2` to `Symphony.PathSafety`.
    * § 10.7 agent runner — `Symphony.AgentRunner.adapter_for/1`
      exists and returns `{:ok, _module}` for the default config.
    * § 11.1 tracker adapter — `Symphony.Tracker.adapter_for/1`
      exists and returns `{:ok, _module}` for every tracker kind the
      spec lists (`:local_markdown`, `:github_issues`, `:linear`,
      `:noop`).
    * § 12 prompt rendering — `Symphony.PromptRenderer.render/1`
      accepts a Liquid template and rejects unknown variables strictly.
  """

  alias Symphony.{Config, PromptRenderer, Tracker}

  @type check_id ::
          :dispatch_preflight
          | :path_safety_delegation
          | :agent_runner_adapter
          | :tracker_adapter_kinds
          | :prompt_renderer_strict

  @type failure :: {check_id(), term()}

  @spec_path Application.compile_env(
               :symphony,
               :spec_path,
               "docs/references/openai_symphony_original_spec.txt"
             )

  @doc """
  Run every check. Returns `:ok` on full success; otherwise
  `{:error, [{check_id, reason}, ...]}` listing the checks that failed.

  Options:
    * `:checks` — limit to a subset of `t:check_id/0`.
    * `:spec_path` — override the path that holds the upstream spec.
      Defaults to `docs/references/openai_symphony_original_spec.txt`
      relative to the repo root (when running under mix from
      `tools/symphony-elixir/` we walk up two levels first).
  """
  @spec run(keyword()) :: :ok | {:error, [failure()]}
  def run(opts \\ []) do
    ensure_modules_loaded()
    requested = Keyword.get(opts, :checks, all_check_ids())
    spec_path = resolve_spec_path(Keyword.get(opts, :spec_path))

    failures =
      requested
      |> Enum.map(fn check -> {check, perform(check, spec_path)} end)
      |> Enum.reject(fn {_id, result} -> result == :ok end)
      |> Enum.map(fn {id, {:error, reason}} -> {id, reason} end)

    case failures do
      [] -> :ok
      list -> {:error, list}
    end
  end

  # `function_exported?/3` returns false until the BEAM has loaded the
  # target module. Under `mix run`/tests the modules are usually already
  # loaded, but `mix symphony.specs_check` invokes us before anything
  # else has touched these modules. Force-load them so the conformance
  # checks see the real exports.
  defp ensure_modules_loaded do
    Enum.each(
      [
        Symphony.Config,
        Symphony.PathSafety,
        Symphony.WorkspaceManager,
        Symphony.AgentRunner,
        Symphony.Tracker,
        Symphony.PromptRenderer
      ],
      &Code.ensure_loaded/1
    )
  end

  @doc "Identifiers for every spec check this module knows how to run."
  @spec all_check_ids() :: [check_id()]
  def all_check_ids do
    [
      :dispatch_preflight,
      :path_safety_delegation,
      :agent_runner_adapter,
      :tracker_adapter_kinds,
      :prompt_renderer_strict
    ]
  end

  @doc """
  Resolve where the spec file lives. Callers may explicitly override; the
  default walks up from the symphony-elixir tool directory to the repo
  root (`../../`) and then resolves the configured relative path.
  """
  @spec resolve_spec_path(binary() | nil) :: binary()
  def resolve_spec_path(nil) do
    case Path.type(@spec_path) do
      :absolute ->
        @spec_path

      _ ->
        # Walk up from `tools/symphony-elixir/` to the repo root so the
        # mix task does not depend on whatever cwd `mix` inherited.
        repo_root = Path.expand("../..", File.cwd!())
        Path.join(repo_root, @spec_path)
    end
  end

  def resolve_spec_path(path) when is_binary(path), do: path

  # ============== Individual checks ==============

  defp perform(:dispatch_preflight, _spec_path) do
    if function_exported?(Config, :validate_dispatch_preflight, 1) do
      with {:ok, config} <- minimal_config(),
           :ok <- Config.validate_dispatch_preflight(config) do
        :ok
      else
        {:error, {:dispatch_preflight, reasons}} ->
          {:error, {:dispatch_preflight_returned, reasons}}

        other ->
          {:error, {:dispatch_preflight_unexpected, other}}
      end
    else
      {:error, :missing_validate_dispatch_preflight}
    end
  end

  defp perform(:path_safety_delegation, _spec_path) do
    expected = [
      {Symphony.PathSafety, :sanitize_key, 1},
      {Symphony.PathSafety, :assert_inside_root!, 2},
      {Symphony.PathSafety, :assert_safe_cwd!, 2},
      {Symphony.WorkspaceManager, :sanitize_key, 1},
      {Symphony.WorkspaceManager, :assert_inside_root!, 2},
      {Symphony.WorkspaceManager, :assert_safe_cwd!, 2}
    ]

    missing =
      Enum.reject(expected, fn {mod, fun, arity} ->
        function_exported?(mod, fun, arity)
      end)

    case missing do
      [] -> :ok
      list -> {:error, {:missing_exports, list}}
    end
  end

  defp perform(:agent_runner_adapter, _spec_path) do
    if function_exported?(Symphony.AgentRunner, :adapter_for, 1) do
      with {:ok, config} <- minimal_config(),
           {:ok, module} <- Symphony.AgentRunner.adapter_for(config),
           true <- is_atom(module) do
        :ok
      else
        false -> {:error, :agent_runner_adapter_returned_non_atom}
        {:error, reason} -> {:error, {:agent_runner_adapter_failed, reason}}
        other -> {:error, {:agent_runner_adapter_unexpected, other}}
      end
    else
      {:error, :missing_agent_runner_adapter_for}
    end
  end

  defp perform(:tracker_adapter_kinds, _spec_path) do
    if function_exported?(Tracker, :adapter_for, 1) do
      kinds = [:local_markdown, :github_issues, :linear, :noop]

      missing =
        Enum.reduce(kinds, [], fn kind, acc ->
          case fake_config_for_kind(kind) |> Tracker.adapter_for() do
            {:ok, mod} when is_atom(mod) -> acc
            {:error, reason} -> [{kind, reason} | acc]
            other -> [{kind, {:unexpected, other}} | acc]
          end
        end)

      case missing do
        [] -> :ok
        list -> {:error, {:tracker_kinds_failed, Enum.reverse(list)}}
      end
    else
      {:error, :missing_tracker_adapter_for}
    end
  end

  defp perform(:prompt_renderer_strict, _spec_path) do
    if function_exported?(PromptRenderer, :render, 1) do
      issue = %Tracker.Issue{
        id: "abc",
        identifier: "WGTE-001",
        title: "Hello",
        state: "todo",
        labels: ["a"]
      }

      with {:ok, _rendered} <-
             PromptRenderer.render(%{template: "{{ issue.title }}", issue: issue}),
           {:error, {:template_render_error, _}} <-
             PromptRenderer.render(%{template: "{{ issue.bogus }}", issue: issue}) do
        :ok
      else
        unexpected -> {:error, {:prompt_renderer_unexpected, unexpected}}
      end
    else
      {:error, :missing_prompt_renderer_render}
    end
  end

  # ============== Helpers ==============

  # Build a minimal in-memory config that satisfies dispatch preflight
  # for the local-markdown tracker (the only kind that requires no API
  # keys). Used by the conformance checks above so they do not depend on
  # any on-disk WORKFLOW.md.
  defp minimal_config do
    workflow = %{
      config: %{
        "tracker" => %{
          "kind" => "local_markdown",
          "issues_root" => ".symphony/issues"
        },
        "agent" => %{"command" => "scripts/bin/llm.sh"},
        "codex" => %{"command" => "codex app-server"},
        "workspace" => %{"root" => System.tmp_dir!()}
      },
      source_path: nil
    }

    Config.from_workflow(workflow)
  end

  defp fake_config_for_kind(kind) do
    %{
      raw: %{},
      resolved: %{
        "tracker.kind" => Atom.to_string(kind),
        "tracker.endpoint" => "https://example.test",
        "tracker.api_key" => "stub",
        "tracker.repo" => "owner/repo",
        "tracker.project_slug" => "stub",
        "tracker.issues_root" => ".symphony/issues"
      },
      source_path: nil
    }
  end
end
