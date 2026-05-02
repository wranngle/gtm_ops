defmodule Symphony.PathSafetyTest do
  use ExUnit.Case, async: true

  doctest Symphony.PathSafety

  alias Symphony.PathSafety

  describe "sanitize_key/1" do
    test "preserves the spec-allowed character class" do
      assert PathSafety.sanitize_key("WGTE-001") == "WGTE-001"
      assert PathSafety.sanitize_key("ABC.123_x") == "ABC.123_x"
      assert PathSafety.sanitize_key("aZ09._-") == "aZ09._-"
    end

    test "replaces every other character 1:1 with underscore (no run-collapse, no trim)" do
      assert PathSafety.sanitize_key("foo bar / baz!") == "foo_bar___baz_"
      assert PathSafety.sanitize_key("/leading/slash") == "_leading_slash"
      assert PathSafety.sanitize_key("trailing!") == "trailing_"
      assert PathSafety.sanitize_key("multiple   spaces") == "multiple___spaces"
    end

    test "falls back to 'issue' for nil or empty input" do
      assert PathSafety.sanitize_key(nil) == "issue"
      assert PathSafety.sanitize_key("") == "issue"
    end

    test "is idempotent for already-safe keys" do
      assert PathSafety.sanitize_key("safe-key.123") == "safe-key.123"
      assert PathSafety.sanitize_key(PathSafety.sanitize_key("a b c")) == "a_b_c"
    end
  end

  describe "assert_inside_root!/2" do
    setup do
      tmp =
        Path.join(System.tmp_dir!(), "symphony-pathsafety-#{System.unique_integer([:positive])}")

      File.mkdir_p!(tmp)
      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, tmp: tmp}
    end

    test "accepts the root itself", %{tmp: tmp} do
      assert :ok = PathSafety.assert_inside_root!(tmp, tmp)
    end

    test "accepts paths inside root", %{tmp: tmp} do
      assert :ok = PathSafety.assert_inside_root!(tmp, Path.join(tmp, "child"))
      assert :ok = PathSafety.assert_inside_root!(tmp, Path.join([tmp, "a", "b", "c"]))
    end

    test "rejects sibling paths", %{tmp: tmp} do
      sibling = tmp <> "-sibling"

      assert_raise RuntimeError, ~r/symphony\.workspace\.escape/, fn ->
        PathSafety.assert_inside_root!(tmp, sibling)
      end
    end

    test "rejects ../ escapes after normalization", %{tmp: tmp} do
      assert_raise RuntimeError, ~r/symphony\.workspace\.escape/, fn ->
        PathSafety.assert_inside_root!(tmp, Path.join(tmp, "../outside"))
      end
    end

    test "rejects an unrelated absolute path", %{tmp: tmp} do
      assert_raise RuntimeError, ~r/symphony\.workspace\.escape/, fn ->
        PathSafety.assert_inside_root!(tmp, "/etc")
      end
    end
  end

  describe "assert_safe_cwd!/2" do
    test "accepts a workspace map whose path equals cwd" do
      ws = %{path: "/tmp/work/X", workspace_key: "X", created_now: true}
      assert :ok = PathSafety.assert_safe_cwd!(ws, "/tmp/work/X")
    end

    test "accepts a raw workspace path string" do
      assert :ok = PathSafety.assert_safe_cwd!("/tmp/work/Y", "/tmp/work/Y")
    end

    test "raises when cwd diverges" do
      ws = %{path: "/tmp/work/A", workspace_key: "A", created_now: true}

      assert_raise RuntimeError, ~r/invariant_violation/, fn ->
        PathSafety.assert_safe_cwd!(ws, "/tmp/work/B")
      end
    end

    test "tolerates equivalent but textually different paths via Path.expand" do
      assert :ok = PathSafety.assert_safe_cwd!("/tmp/work/A", "/tmp/work/./A")
      assert :ok = PathSafety.assert_safe_cwd!("/tmp/work/A", "/tmp/work/B/../A")
    end
  end
end
