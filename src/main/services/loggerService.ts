import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { ConfigService } from './configService';

export class LoggerService {
  private logger: winston.Logger;
  private logDir: string;
  private logFile: string;
  private configService?: ConfigService;

  constructor(configService?: ConfigService) {
    this.configService = configService;
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.ensureLogDirectory();
    
    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `backup-${date}.log`);

    this.logger = winston.createLogger({
      level: this.getLogLevel(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
      ),
      transports: [
        new winston.transports.File({ 
          filename: this.logFile,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level: string, message: string, ...meta: any[]): void {
    this.logger.log(level, message, ...meta);
  }

  info(message: string, ...meta: any[]): void {
    this.logger.info(message, ...meta);
  }

  warn(message: string, ...meta: any[]): void {
    this.logger.warn(message, ...meta);
  }

  error(message: string, ...meta: any[]): void {
    this.logger.error(message, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    this.logger.debug(message, ...meta);
  }

  verbose(message: string, ...meta: any[]): void {
    this.logger.verbose(message, ...meta);
  }

  silly(message: string, ...meta: any[]): void {
    this.logger.silly(message, ...meta);
  }

  getLogPath(): string {
    return this.logDir;
  }

  getRecentLogs(lines: number = 100): string[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      
      return allLines.slice(-lines);
    } catch (error) {
      this.error(`Failed to read logs: ${error}`);
      return [];
    }
  }

  clearLogs(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      files.forEach(file => {
        if (file.endsWith('.log')) {
          fs.unlinkSync(path.join(this.logDir, file));
        }
      });
      this.info('Logs cleared successfully');
    } catch (error) {
      this.error(`Failed to clear logs: ${error}`);
    }
  }

  private getLogLevel(): string {
    if (!this.configService) {
      return 'info';
    }
    
    const config = this.configService.getConfig();
    return config.verboseLogging ? 'debug' : 'info';
  }

  updateLogLevel(): void {
    const newLevel = this.getLogLevel();
    this.logger.level = newLevel;
    this.info(`Log level updated to: ${newLevel}`);
  }

  isDebugEnabled(): boolean {
    return this.logger.level === 'debug' || this.logger.level === 'verbose' || this.logger.level === 'silly';
  }

  isVerboseEnabled(): boolean {
    return this.logger.level === 'verbose' || this.logger.level === 'silly';
  }
}