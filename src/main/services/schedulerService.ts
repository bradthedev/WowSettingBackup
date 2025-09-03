import schedule from 'node-schedule';
import { BackupService } from './backupService';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';

export class SchedulerService {
  private backupService: BackupService;
  private configService: ConfigService;
  private logger: LoggerService;
  private scheduledJob: schedule.Job | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private nextRunTime: Date | null = null;
  private lastRunTime: Date | null = null;

  constructor(
    backupService: BackupService,
    configService: ConfigService,
    logger: LoggerService
  ) {
    this.backupService = backupService;
    this.configService = configService;
    this.logger = logger;
    
    // Load last run time from config on startup
    this.lastRunTime = this.configService.getLastBackupTime('scheduled');
    if (this.lastRunTime) {
      this.logger.info(`Loaded last scheduled backup time: ${this.lastRunTime.toLocaleString()}`);
    }
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
    
    let useFallback = false;
    
    try {
      // Validate cron expression before creating job
      const testJob = schedule.scheduleJob('test-job', cronExpression, () => {});
      if (!testJob) {
        this.logger.warn(`Invalid cron expression: ${cronExpression}, using fallback interval timer`);
        useFallback = true;
      } else {
        testJob.cancel();
        
        this.scheduledJob = schedule.scheduleJob('backup-job', cronExpression, async () => {
          await this.executeBackup();
        });

        if (!this.scheduledJob) {
          this.logger.warn('Failed to create scheduled job, using fallback interval timer');
          useFallback = true;
        }
      }
    } catch (error) {
      this.logger.warn(`Cron scheduler failed: ${error}, using fallback interval timer`);
      useFallback = true;
    }
    
    // Use fallback interval timer if cron failed
    if (useFallback) {
      this.startFallbackScheduler(intervalMinutes);
    }
    
    this.isActive = true;
    this.calculateAndSetNextRunTime(intervalMinutes);
    
    this.logger.info(`Scheduler started - Next run: ${this.nextRunTime?.toLocaleString() || 'Unknown'}`);
    this.logger.debug(`Scheduler configuration: ${intervalMinutes} minute intervals, fallback=${useFallback}`);
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
    
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }

    this.isActive = false;
    this.nextRunTime = null;
    this.lastRunTime = null;
    
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
    // If we don't have a next run time but scheduler is enabled, calculate it
    if (!this.nextRunTime && this.isActive) {
      const config = this.configService.getConfig();
      const intervalMinutes = this.calculateIntervalMinutes(
        config.scheduleInterval,
        config.scheduleUnit
      );
      this.calculateAndSetNextRunTime(intervalMinutes);
    }
    return this.nextRunTime;
  }
  
  getLastRunTime(): Date | null {
    return this.lastRunTime;
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
    
    if (intervalMinutes <= 0 || isNaN(intervalMinutes)) {
      this.logger.warn(`Invalid interval: ${intervalMinutes} minutes, using 60 minutes default`);
      intervalMinutes = 60;
    }
    
    let cronExpression: string;
    
    if (intervalMinutes < 60) {
      // Run every X minutes
      const minutes = Math.round(Math.max(1, Math.min(59, intervalMinutes)));
      cronExpression = `*/${minutes} * * * *`;
    } else if (intervalMinutes === 60) {
      // Run every hour at minute 0
      cronExpression = `0 * * * *`;
    } else if (intervalMinutes < 1440) {
      // Run every X hours at minute 0
      const hours = Math.round(intervalMinutes / 60);
      if (hours === 1) {
        cronExpression = `0 * * * *`;
      } else if (hours <= 23) {
        cronExpression = `0 */${hours} * * *`;
      } else {
        // If more than 23 hours, run once per day
        cronExpression = `0 0 * * *`;
      }
    } else if (intervalMinutes === 1440) {
      // Run once per day at midnight
      cronExpression = `0 0 * * *`;
    } else {
      // Run every X days at midnight
      const days = Math.round(intervalMinutes / 1440);
      if (days <= 31) {
        cronExpression = `0 0 */${days} * *`;
      } else {
        // Maximum interval: once per month
        cronExpression = `0 0 1 * *`;
      }
    }
    
    this.logger.debug(`Generated cron expression: ${cronExpression}`);
    return cronExpression;
  }

  private updateNextRunTime(): void {
    try {
      // Try to get next invocation from scheduled job
      if (this.scheduledJob) {
        try {
          const next = this.scheduledJob.nextInvocation();
          if (next && next instanceof Date && !isNaN(next.getTime())) {
            this.nextRunTime = next;
            this.logger.debug(`Next backup from cron: ${next.toLocaleString()}`);
            return;
          }
        } catch (e) {
          this.logger.debug(`nextInvocation() failed: ${e}`);
        }
      }
      
      // Fallback: calculate based on interval
      const config = this.configService.getConfig();
      const intervalMinutes = this.calculateIntervalMinutes(
        config.scheduleInterval,
        config.scheduleUnit
      );
      
      this.calculateAndSetNextRunTime(intervalMinutes);
    } catch (error) {
      this.logger.error(`Failed to update next invocation time: ${error}`);
      // Even if everything fails, set a next run time
      this.nextRunTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    }
  }
  
  private calculateAndSetNextRunTime(intervalMinutes: number): void {
    if (intervalMinutes <= 0) {
      intervalMinutes = 60; // Default to 1 hour
    }
    
    const baseTime = this.lastRunTime || new Date();
    this.nextRunTime = new Date(baseTime.getTime() + intervalMinutes * 60 * 1000);
    this.logger.debug(`Calculated next run time: ${this.nextRunTime.toLocaleString()}`);
  }
  
  private async executeBackup(): Promise<void> {
    this.logger.info('Scheduled backup starting...');
    this.logger.debug(`Backup triggered at ${new Date().toLocaleString()}`);
    this.lastRunTime = new Date();
    
    try {
      await this.backupService.runScheduledBackup((progress, message) => {
        this.logger.debug(`Scheduled backup progress: ${progress}% - ${message}`);
      });
      
      this.logger.info('Scheduled backup completed successfully');
      // Save last run time to config
      this.configService.updateLastBackupTime('scheduled');
    } catch (error) {
      this.logger.error(`Scheduled backup failed: ${error}`);
      this.logger.debug('Scheduled backup error details:', error);
    }
    
    // Update next run time after job execution
    this.updateNextRunTime();
    this.logger.debug(`Next scheduled backup: ${this.nextRunTime?.toLocaleString() || 'Unknown'}`);
  }
  
  private startFallbackScheduler(intervalMinutes: number): void {
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
    }
    
    const intervalMs = intervalMinutes * 60 * 1000;
    this.logger.info(`Starting fallback interval scheduler with ${intervalMinutes} minute intervals`);
    
    // Execute backup immediately if never run before, otherwise wait for interval
    if (!this.lastRunTime) {
      setTimeout(() => this.executeBackup(), 1000);
    }
    
    this.fallbackInterval = setInterval(async () => {
      await this.executeBackup();
    }, intervalMs);
  }

  async runBackupNow(): Promise<void> {
    this.logger.info('Manual backup triggered from scheduler');
    
    try {
      await this.backupService.runBackup((progress, message) => {
        this.logger.debug(`Manual backup progress: ${progress}% - ${message}`);
      });
      
      this.logger.info('Manual backup completed successfully');
      // Save last manual backup time
      this.configService.updateLastBackupTime('manual');
    } catch (error) {
      this.logger.error(`Manual backup failed: ${error}`);
      throw error;
    }
  }
}