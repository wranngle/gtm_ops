import Config

config :logger, level: :info

# Default the prod logging sink to a fan-out of stderr + a JSONL file that
# the local Vector config tails into VictoriaLogs. The file path is
# repo-relative so it matches the rest of the bash adapter's conventions:
# `.symphony/logs/` is on the standard Vector tail include glob.
#
# Override per environment by setting `SYMPHONY_LOG_FILE` (used by
# `Symphony.Application.default_sink/0`) or by overriding
# `config :symphony, :logging_sink, ...` in a release config.
config :symphony,
  logging_sink:
    {:multi,
     [
       :stderr,
       {:file, ".symphony/logs/symphony-elixir.jsonl"}
     ]}
