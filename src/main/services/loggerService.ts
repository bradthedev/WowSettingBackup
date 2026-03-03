import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: string;
}

export class LoggerService {
  private logger: winston.Logger;
  private logDir: string;

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    const logDir = this.logDir;

    const transport = new DailyRotateFile({
      dirname: logDir,
      filename: 'wow-backup-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '5m',
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
    });

    this.logger = winston.createLogger({
      level: 'info',
      transports: [
        transport,
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${message}${metaStr}`;
            }),
          ),
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  readRecentLogs(maxLines: number = 200): LogEntry[] {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter((f) => f.endsWith('.log'))
        .sort()
        .reverse();

      if (files.length === 0) return [];

      const content = fs.readFileSync(path.join(this.logDir, files[0]), 'utf-8');
      const lines = content.trim().split('\n').slice(-maxLines);

      return lines.map((line) => {
        try {
          const parsed = JSON.parse(line) as { timestamp?: string; level?: string; message?: string };
          const { timestamp, level, message, ...rest } = parsed;
          return {
            timestamp: timestamp ?? new Date().toISOString(),
            level: level ?? 'info',
            message: message ?? line,
            meta: Object.keys(rest).length > 0 ? JSON.stringify(rest) : undefined,
          };
        } catch {
          return { timestamp: new Date().toISOString(), level: 'info', message: line };
        }
      });
    } catch {
      return [];
    }
  }

  getLogDir(): string {
    return this.logDir;
  }
}
