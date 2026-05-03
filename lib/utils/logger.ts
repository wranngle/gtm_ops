/**
 * Structured Logger - JSON output with correlation IDs (ADR-010)
 * @module lib/utils/logger
 */

import { sanitize } from './errors.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  correlationId: string;
  stage: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;
  private correlationId: string;
  private stage: string;

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.correlationId = '';
    this.stage = 'init';
  }

  setCorrelationId(id: string) {
    this.correlationId = id;
  }

  setStage(stage: string) {
    this.stage = stage;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId,
      stage: this.stage,
      message: sanitize(message),
      metadata: metadata ? JSON.parse(sanitize(JSON.stringify(metadata))) : undefined,
    };
  }

  private output(entry: LogEntry) {
    const line = JSON.stringify(entry);
    if (entry.level === 'error') {
      console.error(line);
    } else if (entry.level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, metadata));
    }
  }

  info(message: string, metadata?: Record<string, unknown>) {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, metadata));
    }
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, metadata));
    }
  }

  error(message: string, metadata?: Record<string, unknown>) {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, metadata));
    }
  }

  // Convenience method for stage timing
  stageStart(stage: string) {
    this.setStage(stage);
    this.info(`Stage started: ${stage}`);
    return Date.now();
  }

  stageEnd(stage: string, startTime: number) {
    const duration = Date.now() - startTime;
    this.info(`Stage completed: ${stage}`, { duration_ms: duration });
  }
}

// Singleton export
export const logger = new Logger();
