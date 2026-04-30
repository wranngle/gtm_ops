export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
}

export const StderrJsonLogger: Logger = {
  info(message, fields) {
    emit("info", message, fields);
  },
  warn(message, fields) {
    emit("warn", message, fields);
  },
};

function emit(
  level: "info" | "warn",
  message: string,
  fields: Record<string, unknown> | undefined,
): void {
  const event = {
    "@timestamp": new Date().toISOString(),
    "log.level": level,
    "service.name": "agent-evals",
    message,
    ...fields,
  };
  process.stderr.write(JSON.stringify(event) + "\n");
}
