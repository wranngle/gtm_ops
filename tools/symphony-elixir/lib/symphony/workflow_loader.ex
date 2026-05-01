defmodule Symphony.WorkflowLoader do
  @moduledoc """
  Parses `WORKFLOW.md` per the Symphony spec, section 5.

  Layout: optional YAML front matter delimited by `---`, followed by the
  prompt-template body. Returns `%{config: map(), prompt_template: binary()}`.

  YAML decoding uses `yaml_elixir`. The decoded map mirrors the spec's
  top-level keys: `tracker`, `polling`, `workspace`, `hooks`, `agent`,
  `codex`, plus any extension keys (forward-compat per spec section 5.3).
  """

  @type workflow :: %{
          required(:config) => map(),
          required(:prompt_template) => binary(),
          required(:source_path) => binary()
        }

  @spec load(binary() | nil) :: {:ok, workflow()} | {:error, term()}
  def load(path \\ nil) do
    resolved = resolve_path(path)

    with {:ok, contents} <- read_file(resolved),
         {:ok, {front_matter, body}} <- split_front_matter(contents),
         {:ok, config} <- decode_yaml(front_matter) do
      {:ok,
       %{
         config: config,
         prompt_template: String.trim(body),
         source_path: resolved
       }}
    end
  end

  @doc """
  Read a value out of the workflow config using a dotted path.

  ## Examples

      iex> WorkflowLoader.fetch(workflow, "tracker.kind", "local_markdown")
      "github_issues"
  """
  @spec fetch(workflow(), binary(), term()) :: term()
  def fetch(%{config: config}, dotted_path, default \\ nil) do
    do_fetch(config, String.split(dotted_path, "."), default)
  end

  defp do_fetch(value, [], _default), do: value
  defp do_fetch(map, [key | rest], default) when is_map(map) do
    case Map.fetch(map, key) do
      {:ok, value} -> do_fetch(value, rest, default)
      :error -> default
    end
  end
  defp do_fetch(_value, _path, default), do: default

  defp resolve_path(nil), do: Application.get_env(:symphony, :workflow_path)
  defp resolve_path(p), do: p

  defp read_file(path) do
    case File.read(path) do
      {:ok, contents} -> {:ok, contents}
      {:error, reason} -> {:error, {:missing_workflow_file, path, reason}}
    end
  end

  defp split_front_matter(contents) do
    lines = String.split(contents, ~r/\r?\n/, trim: false)

    case lines do
      ["---" | rest] ->
        case Enum.split_while(rest, &(&1 != "---")) do
          {fm, ["---" | body]} ->
            {:ok, {Enum.join(fm, "\n"), Enum.join(body, "\n")}}

          {_fm, []} ->
            {:error, :unterminated_front_matter}
        end

      _ ->
        # No front matter — entire file is the prompt body.
        {:ok, {"", contents}}
    end
  end

  defp decode_yaml(""), do: {:ok, %{}}

  defp decode_yaml(yaml) do
    case YamlElixir.read_from_string(yaml) do
      {:ok, value} when is_map(value) -> {:ok, value}
      {:ok, _} -> {:error, :workflow_front_matter_not_a_map}
      {:error, reason} -> {:error, {:workflow_parse_error, reason}}
    end
  end
end
