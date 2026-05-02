defmodule Mix.Tasks.Symphony.SpecsCheck do
  @moduledoc """
  Asserts the running codebase still implements the spec sections it
  claims to.

  Wraps `Symphony.SpecsCheck.run/1`; the task itself stays a thin shell
  so the heavy lifting can be exercised from regular ExUnit tests.

  Usage:

      mix symphony.specs_check
      mix symphony.specs_check --check dispatch_preflight --check tracker_adapter_kinds
      mix symphony.specs_check --spec-path /abs/path/to/spec.txt

  Exit behaviour:

    * `:ok` (exit 0) when every requested check passes.
    * `Mix.raise/1` (exit non-zero) when one or more checks fail; the
      reason for each is printed to stderr in `key=value` form.
  """
  use Mix.Task

  alias Symphony.SpecsCheck

  @shortdoc "Verify spec-mandated Symphony surfaces are wired"

  @switches [check: :keep, spec_path: :string]

  @impl Mix.Task
  def run(args) do
    {opts, _argv, _invalid} = OptionParser.parse(args, strict: @switches)

    checks =
      opts
      |> Keyword.get_values(:check)
      |> Enum.map(&String.to_atom/1)
      |> case do
        [] -> SpecsCheck.all_check_ids()
        list -> list
      end

    spec_path = Keyword.get(opts, :spec_path)

    runner_opts = [checks: checks] ++ if(spec_path, do: [spec_path: spec_path], else: [])

    case SpecsCheck.run(runner_opts) do
      :ok ->
        Mix.shell().info(
          "symphony.specs_check: ok checks=#{Enum.join(Enum.map(checks, &Atom.to_string/1), ",")}"
        )

        :ok

      {:error, failures} ->
        Enum.each(failures, fn {id, reason} ->
          Mix.shell().error("symphony.specs_check check=#{id} outcome=failure reason=#{inspect(reason)}")
        end)

        Mix.raise("symphony.specs_check failed with #{length(failures)} check failure(s)")
    end
  end
end
