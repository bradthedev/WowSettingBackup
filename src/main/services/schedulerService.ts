import { BackupService } from './backupService';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';

export interface SchedulerStatus {
  running: boolean;
  nextRunTime?: string;
  lastRunTime?: string;
}

export class SchedulerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastRunTime: Date | null = null;
  private nextRunTime: Date | null = null;

  constructor(
    private backup: BackupService,
    private config: ConfigService,
    private logger: LoggerService,
  ) {}

  start(): void {
    if (this.intervalId) {
      this.stop();
    }

    const intervalMinutes = this.config.get('schedulerIntervalMinutes');
    const intervalMs = intervalMinutes * 60 * 1000;

    this.nextRunTime = new Date(Date.now() + intervalMs);
    this.logger.info('Scheduler started', { intervalMinutes });

    this.intervalId = setInterval(async () => {
      this.logger.info('Scheduled backup triggered');
      this.lastRunTime = new Date();
      this.nextRunTime = new Date(Date.now() + intervalMs);

      try {
        await this.backup.createBackup('scheduled');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error('Scheduled backup failed', { error: message });
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.nextRunTime = null;
      this.logger.info('Scheduler stopped');
    }
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.intervalId !== null,
      nextRunTime: this.nextRunTime?.toISOString(),
      lastRunTime: this.lastRunTime?.toISOString(),
    };
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}
