defmodule Symphony.LogFile do
  @moduledoc """
  Configures OTP's built-in rotating disk log handler for application logs.

  Ported from upstream `SymphonyElixir.LogFile`. The handler complements
  `Symphony.Logging.Sink` (which writes JSON-line operator events): this
  module captures plain `Logger` messages so an operator can grep raw OTP
  logs without setting up a separate file sink.

  Configuration is driven by application env keys under `:symphony`:

    * `:log_file` — absolute path. Defaults to `<cwd>/log/symphony.log`.
    * `:log_file_max_bytes` — wrap size per file. Default 10 MiB.
    * `:log_file_max_files` — number of rotated files retained. Default 5.

  Call `configure/0` once during application boot. The module is otherwise
  idempotent: re-invocation removes the prior handler and re-attaches.
  """

  require Logger

  @handler_id :symphony_disk_log
  @default_log_relative_path "log/symphony.log"
  @default_max_bytes 10 * 1024 * 1024
  @default_max_files 5

  @spec default_log_file() :: Path.t()
  def default_log_file do
    default_log_file(File.cwd!())
  end

  @spec default_log_file(Path.t()) :: Path.t()
  def default_log_file(logs_root) when is_binary(logs_root) do
    Path.join(logs_root, @default_log_relative_path)
  end

  @spec configure() :: :ok
  def configure do
    log_file = Application.get_env(:symphony, :log_file, default_log_file())
    max_bytes = Application.get_env(:symphony, :log_file_max_bytes, @default_max_bytes)
    max_files = Application.get_env(:symphony, :log_file_max_files, @default_max_files)

    setup_disk_handler(log_file, max_bytes, max_files)
  end

  defp setup_disk_handler(log_file, max_bytes, max_files) do
    expanded_path = Path.expand(log_file)
    :ok = File.mkdir_p(Path.dirname(expanded_path))
    :ok = remove_existing_handler()

    case :logger.add_handler(
           @handler_id,
           :logger_disk_log_h,
           disk_log_handler_config(expanded_path, max_bytes, max_files)
         ) do
      :ok ->
        :ok

      {:error, reason} ->
        Logger.warning("Failed to configure rotating log file handler: #{inspect(reason)}")
        :ok
    end
  end

  defp remove_existing_handler do
    case :logger.remove_handler(@handler_id) do
      :ok -> :ok
      {:error, {:not_found, @handler_id}} -> :ok
      {:error, _reason} -> :ok
    end
  end

  defp disk_log_handler_config(path, max_bytes, max_files) do
    %{
      level: :all,
      formatter: {:logger_formatter, %{single_line: true}},
      config: %{
        file: String.to_charlist(path),
        type: :wrap,
        max_no_bytes: max_bytes,
        max_no_files: max_files
      }
    }
  end
end
