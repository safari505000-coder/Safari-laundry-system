import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { requestContext } from '../tracing/request-async-context';

@Injectable()
export class JsonConsoleLogger extends ConsoleLogger {
  private ctxFields(): Record<string, unknown> {
    const s = requestContext.getStore();
    if (!s) {
      return {};
    }
    const o: Record<string, unknown> = {};
    if (s.traceId) {
      o.traceId = s.traceId;
    }
    if (s.orderId) {
      o.orderId = s.orderId;
    }
    return o;
  }

  private jsonPayload(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  private line(level: LogLevel, message: unknown, context?: string): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context ?? 'Application',
      ...this.ctxFields(),
      message: this.jsonPayload(message),
    });
  }

  override log(message: unknown, context?: string): void {
    process.stdout.write(`${this.line('log', message, context)}\n`);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        context: context ?? this.context ?? 'Application',
        ...this.ctxFields(),
        message: this.jsonPayload(message),
        stack: stack ?? undefined,
      })}\n`,
    );
  }

  override warn(message: unknown, context?: string): void {
    process.stderr.write(`${this.line('warn', message, context)}\n`);
  }

  override debug(message: unknown, context?: string): void {
    process.stdout.write(`${this.line('debug', message, context)}\n`);
  }

  override verbose(message: unknown, context?: string): void {
    process.stdout.write(`${this.line('verbose', message, context)}\n`);
  }
}
