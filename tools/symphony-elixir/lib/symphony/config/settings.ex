defmodule Symphony.Config.Settings do
  @moduledoc """
  Per-config carrier built by `Symphony.Config.from_workflow/1`.

  Wraps a parsed `Symphony.Config.Schema.t()` plus the workflow file's
  `source_path` so callers that need to reload `WORKFLOW.md` from
  inside an agent runner have it without a separate accessor. Replaces
  the legacy `%{raw, resolved, source_path}` shape (deleted 2026-05-02
  in PR (b) of the dual-track collapse).
  """

  alias Symphony.Config.Schema

  @type t :: %__MODULE__{
          schema: Schema.t(),
          source_path: binary() | nil
        }

  defstruct [:schema, :source_path]
end
