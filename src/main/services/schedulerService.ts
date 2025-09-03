import schedule from 'node-schedule';
import { BackupService } from './backupService';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';

export class SchedulerService {
  private backupService: BackupService;
  private configService: ConfigService;
  private logger: LoggerService;
  private scheduledJob: schedule.Job | null = null;
  private isActive: boolean = false;
  private nextRunTime: Date | null = null;

  constructor(
    backupService: BackupService,
    configService: ConfigService,
    logger: LoggerService
  ) {
    this.backupService = backupService;
    this.configService = configService;
    this.logger = logger;
  }

  start(): void {
    if (this.isActive) {
      this.logger.warn('Scheduler is already running');
      return;
    }

    const config = this.configService.getConfig();
    this.logger.debug(`Starting scheduler with config: interval=${config.scheduleInterval}, unit=${config.scheduleUnit}, enabled=${config.schedulerEnabled}`);
    
    if (!config.schedulerEnabled) {
      this.logger.warn('Scheduler is disabled in configuration');
      return;
    }

    const intervalMinutes = this.calculateIntervalMinutes(
      config.scheduleInterval,
      config.scheduleUnit
    );

    if (intervalMinutes <= 0) {
      this.logger.error(`Invalid schedule interval: ${config.scheduleInterval} ${config.scheduleUnit} = ${intervalMinutes} minutes`);
      return;
    }

    // Create cron expression for the interval
    const cronExpression = this.createCronExpression(intervalMinutes);
    this.logger.debug(`Created cron expression: ${cronExpression} for interval: ${intervalMinutes} minutes`);
    
    try {
      this.scheduledJob = schedule.scheduleJob(cronExpression, async () => {
      this.logger.info('Scheduled backup starting...');
      this.logger.debug(`Backup triggered by scheduler at ${new Date().toLocaleString()}`);
      
      try {
        await this.backupService.runScheduledBackup((progress, message) => {
          this.logger.debug(`Scheduled backup progress: ${progress}% - ${message}`);
        });
        
        this.logger.info('Scheduled backup completed successfully');
      } catch (error) {
        this.logger.error(`Scheduled backup failed: ${error}`);
        this.logger.debug('Scheduled backup error details:', error);
      }
      
      // Update next run time
      this.updateNextRunTime();
      this.logger.debug(`Next scheduled backup: ${this.nextRunTime?.toLocaleString()}`);
    });

      if (!this.scheduledJob) {
        throw new Error('Failed to create scheduled job');
      }

      this.isActive = true;
      this.updateNextRunTime();
      
      this.logger.info(`Scheduler started - Next run: ${this.nextRunTime?.toLocaleString()}`);
      this.logger.debug(`Scheduler configuration: ${intervalMinutes} minute intervals using cron: ${cronExpression}`);
      
    } catch (error) {
      this.logger.error(`Failed to start scheduler: ${error}`);
      this.isActive = false;
      this.nextRunTime = null;
      if (this.scheduledJob) {
        this.scheduledJob.cancel();
        this.scheduledJob = null;
      }
      throw error;
    }
  }

  stop(): void {
    if (!this.isActive) {
      this.logger.warn('Scheduler is not running');
      return;
    }

    if (this.scheduledJob) {
      this.scheduledJob.cancel();
      this.scheduledJob = null;
    }

    this.isActive = false;
    this.nextRunTime = null;
    
    this.logger.info('Scheduler stopped');
  }

  restart(): void {
    this.stop();
    this.start();
  }

  isRunning(): boolean {
    return this.isActive;
  }

  getNextRunTime(): Date | null {
    return this.nextRunTime;
  }

  private calculateIntervalMinutes(interval: number, unit: string): number {
    switch (unit) {
      case 'minutes':
        return interval;
      case 'hours':
        return interval * 60;
      case 'days':
        return interval * 60 * 24;
      default:
        return 60; // Default to 1 hour
    }
  }

  private createCronExpression(intervalMinutes: number): string {
    this.logger.debug(`Creating cron expression for ${intervalMinutes} minutes`);
    
    if (intervalMinutes <= 0) {
      this.logger.warn(`Invalid interval: ${intervalMinutes} minutes, using 60 minutes default`);
      intervalMinutes = 60;
    }
    
    let cronExpression: string;
    
    if (intervalMinutes < 60) {
      // Run every X minutes - but clamp to reasonable values
      const minutes = Math.max(1, Math.min(59, intervalMinutes));
      cronExpression = `*/${minutes} * * * *`;
    } else if (intervalMinutes < 1440) {
      // Run every X hours
      const hours = Math.max(1, Math.floor(intervalMinutes / 60));
      cronExpression = `0 */${hours} * * *`;
    } else {
      // Run every X days at midnight
      const days = Math.max(1, Math.floor(intervalMinutes / 1440));
      cronExpression = `0 0 */${days} * *`;
    }
    
    this.logger.debug(`Generated cron expression: ${cronExpression}`);
    return cronExpression;
  }

  private updateNextRunTime(): void {
    if (this.scheduledJob) {
      try {
        const nextInvocation = this.scheduledJob.nextInvocation();
        if (nextInvocation && nextInvocation instanceof Date && !isNaN(nextInvocation.getTime())) {
          this.nextRunTime = nextInvocation;
          this.logger.debug(`Next backup scheduled for: ${nextInvocation.toLocaleString()}`);
        } else {
          this.logger.warn('Scheduler next invocation returned invalid date');
          this.nextRunTime = null;
        }
      } catch (error) {
        this.logger.error(`Failed to get next invocation time: ${error}`);
        this.nextRunTime = null;
      }
    } else {
      this.nextRunTime = null;
    }
  }

  async runBackupNow(): Promise<void> {
    this.logger.info('Manual backup triggered from scheduler');
    
    try {
      await this.backupService.runBackup((progress, message) => {
        this.logger.debug(`Manual backup progress: ${progress}% - ${message}`);
      });
      
      this.logger.info('Manual backup completed successfully');
    } catch (error) {
      this.logger.error(`Manual backup failed: ${error}`);
      throw error;
    }
  }
}