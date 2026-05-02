defmodule Symphony.PathSafety do
  @moduledoc """
  Path-safety primitives that back `Symphony.WorkspaceManager`'s spec § 9.5
  invariants.

  Three public operations:

    * `sanitize_key/1` — invariant 3. Replace every character outside
      `[A-Za-z0-9._-]` with `_`. Strict 1:1 substitution: no run-collapse,
      no trim. The literal reading of section 9.5 ("Replace all other
      characters with `_`") is preferred so workspace directory names line
      up with the spec wording.
    * `assert_inside_root!/2` — invariant 2. Both arguments are normalized
      to absolute paths before the prefix check. Raises `RuntimeError` on
      escape so a misconfigured `workspace.root` cannot redirect agent work
      into an unrelated directory.
    * `assert_safe_cwd!/2` — invariant 1. Confirms that the agent process
      is about to start with `cwd === workspace.path`.

  This module deliberately does *no* filesystem I/O beyond the canonical
  path math; symlink-resolution and directory-existence concerns belong to
  the workspace manager that calls it.
  """

  @sanitize_pattern ~r/[^A-Za-z0-9._-]/

  @doc """
  Sanitize an issue identifier into a workspace key per spec § 9.5
  invariant 3 — strict 1:1 substitution.

      iex> Symphony.PathSafety.sanitize_key("WGTE-001")
      "WGTE-001"

      iex> Symphony.PathSafety.sanitize_key("foo bar / baz!")
      "foo_bar___baz_"

      iex> Symphony.PathSafety.sanitize_key("/leading/slash")
      "_leading_slash"

  Empty / nil identifiers fall back to `"issue"` so callers never pass an
  empty path component to the filesystem.
  """
  @spec sanitize_key(binary() | nil) :: binary()
  def sanitize_key(nil), do: "issue"
  def sanitize_key(""), do: "issue"

  def sanitize_key(identifier) when is_binary(identifier) do
    String.replace(identifier, @sanitize_pattern, "_")
  end

  @doc """
  Assert that `path` is inside `root` after absolute-path normalization.
  Raises `RuntimeError` on escape — section 9.5 invariant 2.

  Equality is allowed (`path == root`) so callers that pass the root
  itself for a sanity check do not see a spurious failure.
  """
  @spec assert_inside_root!(binary(), binary()) :: :ok
  def assert_inside_root!(root, path) when is_binary(root) and is_binary(path) do
    abs_root = Path.expand(root)
    abs_path = Path.expand(path)

    cond do
      abs_path == abs_root ->
        :ok

      String.starts_with?(abs_path, abs_root <> "/") ->
        :ok

      true ->
        raise "symphony.workspace.escape root=#{abs_root} path=#{abs_path}"
    end
  end

  @doc """
  Assert that the agent is about to run with `cwd === workspace.path`.
  Raises `RuntimeError` on mismatch — section 9.5 invariant 1.

  `workspace` may be either a workspace map (with `:path`) or a raw path
  string, so callers without a structured workspace handle (for example
  recovery code paths) can still invoke the check.
  """
  @spec assert_safe_cwd!(map() | binary(), binary()) :: :ok
  def assert_safe_cwd!(%{path: ws_path}, cwd) when is_binary(cwd) do
    assert_safe_cwd!(ws_path, cwd)
  end

  def assert_safe_cwd!(ws_path, cwd) when is_binary(ws_path) and is_binary(cwd) do
    if Path.expand(ws_path) == Path.expand(cwd) do
      :ok
    else
      raise "symphony.workspace.invariant_violation cwd=#{cwd} workspace=#{ws_path}"
    end
  end

  @doc """
  Canonicalize an absolute path, resolving symlinks segment by segment.
  Returns the resolved path on success, or `{:error, {:path_canonicalize_failed, expanded, reason}}`
  on filesystem error. Non-existent trailing segments are passed through
  (so callers can canonicalize a path that does not yet exist as long as
  its existing prefix is resolvable).

  Used by `Symphony.Config.Schema` to resolve `workspace.root` into a
  canonical filesystem location before sandbox policy checks.
  """
  @spec canonicalize(Path.t()) :: {:ok, Path.t()} | {:error, term()}
  def canonicalize(path) when is_binary(path) do
    expanded_path = Path.expand(path)
    {root, segments} = split_absolute_path(expanded_path)

    case resolve_segments(root, [], segments) do
      {:ok, canonical_path} ->
        {:ok, canonical_path}

      {:error, reason} ->
        {:error, {:path_canonicalize_failed, expanded_path, reason}}
    end
  end

  defp split_absolute_path(path) when is_binary(path) do
    [root | segments] = Path.split(path)
    {root, segments}
  end

  defp resolve_segments(root, resolved_segments, []),
    do: {:ok, join_canonical(root, resolved_segments)}

  defp resolve_segments(root, resolved_segments, [segment | rest]) do
    candidate_path = join_canonical(root, resolved_segments ++ [segment])

    case File.lstat(candidate_path) do
      {:ok, %File.Stat{type: :symlink}} ->
        with {:ok, target} <- :file.read_link_all(String.to_charlist(candidate_path)) do
          resolved_target =
            Path.expand(IO.chardata_to_string(target), join_canonical(root, resolved_segments))

          {target_root, target_segments} = split_absolute_path(resolved_target)
          resolve_segments(target_root, [], target_segments ++ rest)
        end

      {:ok, _stat} ->
        resolve_segments(root, resolved_segments ++ [segment], rest)

      {:error, :enoent} ->
        {:ok, join_canonical(root, resolved_segments ++ [segment | rest])}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp join_canonical(root, segments) when is_list(segments) do
    Enum.reduce(segments, root, fn segment, acc -> Path.join(acc, segment) end)
  end
end
