import path from 'path';
import fs from 'fs';
import { BrowserWindow } from 'electron';
import { ConfigService } from './configService';
import { CompressionService } from './compressionService';
import { BackupHistoryService } from './backupHistoryService';
import { LoggerService } from './loggerService';

export interface BackupResult {
  success: boolean;
  message: string;
  backupPath?: string;
  size?: number;
  duration?: number;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  duration?: number;
}

export class BackupService {
  constructor(
    private config: ConfigService,
    private compression: CompressionService,
    private history: BackupHistoryService,
    private logger: LoggerService,
  ) {}

  async createBackup(type: 'manual' | 'scheduled' | 'pre-restore' = 'manual'): Promise<BackupResult> {
    const startTime = Date.now();
    const wowPath = this.config.get('wowPath');
    const wowVersion = this.config.get('wowVersion');
    const backupDir = this.config.get('backupDir');

    // Validate WoW path
    const interfacePath = path.join(wowPath, wowVersion, 'Interface');
    const wtfPath = path.join(wowPath, wowVersion, 'WTF');

    if (!fs.existsSync(interfacePath) && !fs.existsSync(wtfPath)) {
      const msg = `WoW settings not found at ${path.join(wowPath, wowVersion)}`;
      this.logger.error(msg);
      return { success: false, message: msg };
    }

    // Ensure backup dir exists
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `wow-backup-${wowVersion}-${timestamp}`;
    const outputPath = path.join(backupDir, `${backupName}.tar.lz4`);

    const sourcePaths: string[] = [];
    if (fs.existsSync(interfacePath)) sourcePaths.push(interfacePath);
    if (fs.existsSync(wtfPath)) sourcePaths.push(wtfPath);

    try {
      this.logger.info('Creating backup', { backupName, sourcePaths });
      this.sendProgress(0, 'Starting backup...');

      await this.compression.compress(sourcePaths, outputPath, (progress, message) => {
        this.sendProgress(progress, message);
      });

      const size = fs.statSync(outputPath).size;
      const duration = Date.now() - startTime;

      this.history.add({
        name: backupName,
        path: outputPath,
        size,
        date: new Date().toISOString(),
        type,
        status: 'success',
        duration,
      });

      this.sendProgress(100, 'Backup complete');
      this.logger.info('Backup created successfully', { outputPath, size, duration });

      return { success: true, message: 'Backup created successfully', backupPath: outputPath, size, duration };
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('Backup failed', { error: message });

      this.history.add({
        name: backupName,
        path: outputPath,
        size: 0,
        date: new Date().toISOString(),
        type,
        status: 'failed',
        duration,
      });

      return { success: false, message: `Backup failed: ${message}`, duration };
    }
  }

  async restoreBackup(archivePath: string): Promise<RestoreResult> {
    const startTime = Date.now();
    const wowPath = this.config.get('wowPath');
    const wowVersion = this.config.get('wowVersion');

    if (!fs.existsSync(archivePath)) {
      return { success: false, message: `Archive not found: ${archivePath}` };
    }

    const restoreDir = path.join(wowPath, wowVersion);
    fs.mkdirSync(restoreDir, { recursive: true });

    try {
      this.logger.info('Restoring backup', { archivePath, restoreDir });
      this.sendProgress(0, 'Starting restore...');

      // Create a pre-restore backup
      await this.createBackup('pre-restore');

      this.sendProgress(50, 'Extracting backup...');
      await this.compression.decompress(archivePath, restoreDir, (progress, message) => {
        this.sendProgress(50 + progress * 0.5, message);
      });

      const duration = Date.now() - startTime;
      this.sendProgress(100, 'Restore complete');
      this.logger.info('Restore completed', { duration });

      return { success: true, message: 'Restore completed successfully', duration };
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error('Restore failed', { error: message });
      return { success: false, message: `Restore failed: ${message}`, duration };
    }
  }

  private sendProgress(progress: number, message: string): void {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('progress:update', progress, message);
    }
  }
}
