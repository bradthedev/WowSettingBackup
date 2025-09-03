import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from './configService';
import { CompressionService } from './compressionService';
import { LoggerService } from './loggerService';
import { BackupHistoryService } from './backupHistoryService';

const execAsync = promisify(exec);
const fsPromises = fs.promises;

export class BackupService {
  private configService: ConfigService;
  private compressionService: CompressionService;
  private logger: LoggerService;
  private backupHistoryService?: BackupHistoryService;
  private isRunning: boolean = false;

  constructor(
    configService: ConfigService,
    compressionService: CompressionService,
    logger: LoggerService,
    backupHistoryService?: BackupHistoryService
  ) {
    this.configService = configService;
    this.compressionService = compressionService;
    this.logger = logger;
    this.backupHistoryService = backupHistoryService;
  }

  async runBackup(progressCallback?: (progress: number, message: string) => void): Promise<void> {
    return this.performBackup('manual', progressCallback);
  }

  async runScheduledBackup(progressCallback?: (progress: number, message: string) => void): Promise<void> {
    return this.performBackup('scheduled', progressCallback);
  }

  private async performBackup(backupType: 'manual' | 'scheduled', progressCallback?: (progress: number, message: string) => void): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Backup operation already in progress, rejecting new request');
      throw new Error('Backup is already running');
    }

    this.isRunning = true;
    const config = this.configService.getConfig();
    const startTime = Date.now();
    let backupPath: string | undefined;
    
    try {
      this.logger.info('=== Starting WoW Backup ===');
      this.logger.debug(`Backup configuration: WoW Path=${config.wowPath}, Version=${config.wowVersion}, Backup Dir=${config.backupDir}`);
      progressCallback?.(0, 'Starting backup...');

      // Validate paths
      this.logger.debug('Validating WoW installation paths');
      this.validatePaths(config);
      this.logger.debug('Path validation completed successfully');

      // Create temp and backup directories
      progressCallback?.(10, 'Creating directories...');
      this.logger.debug(`Creating temporary directory: ${config.tempDir}`);
      await this.ensureDirectory(config.tempDir);
      this.logger.debug(`Creating backup directory: ${config.backupDir}`);
      await this.ensureDirectory(config.backupDir);

      // Copy WoW files
      progressCallback?.(20, 'Copying WoW files...');
      this.logger.debug('Starting file copy operation');
      await this.copyWoWFiles(config, progressCallback);
      this.logger.debug('File copy operation completed');

      // Compress files
      progressCallback?.(70, 'Compressing backup...');
      const backupFileName = this.generateBackupFileName();
      backupPath = path.join(config.backupDir, backupFileName);
      this.logger.debug(`Creating compressed backup: ${backupFileName}`);
      
      await this.compressionService.compressDirectory(
        config.tempDir,
        backupPath,
        config.fastCompression,
        progressCallback
      );

      // Clean up temp directory
      progressCallback?.(90, 'Cleaning up...');
      this.logger.debug('Cleaning up temporary directory');
      await this.cleanupTempDirectory(config.tempDir);

      // Clean old backups
      progressCallback?.(95, 'Removing old backups...');
      this.logger.debug(`Cleaning old backups (retention: ${config.backupRetention} days)`);
      await this.cleanOldBackups(config);

      const duration = Date.now() - startTime;

      // Add successful backup to history
      if (this.backupHistoryService && backupPath) {
        const filesCount = await this.countFilesInDirectory(config.tempDir);
        this.backupHistoryService.addBackupEntry(backupPath, backupType, duration, filesCount);
      }

      progressCallback?.(100, 'Backup completed successfully!');
      this.logger.info('=== Backup Completed Successfully ===');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Add failed backup to history
      if (this.backupHistoryService) {
        const backupFileName = backupPath ? path.basename(backupPath) : this.generateBackupFileName();
        this.backupHistoryService.addFailedBackupEntry(backupFileName, backupType, duration);
      }
      
      this.logger.error(`Backup operation failed: ${error}`);
      this.logger.debug(`Backup failure details:`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async restoreBackup(
    backupPath: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Restore operation already in progress, rejecting new request');
      throw new Error('Operation is already running');
    }

    this.isRunning = true;
    const config = this.configService.getConfig();
    
    try {
      this.logger.info('=== Starting WoW Restore ===');
      this.logger.debug(`Restore configuration: Backup=${backupPath}, WoW Path=${config.wowPath}`);
      progressCallback?.(0, 'Starting restore...');

      // Validate backup file
      this.logger.debug('Validating backup file existence');
      if (!fs.existsSync(backupPath)) {
        this.logger.error(`Backup file does not exist: ${backupPath}`);
        throw new Error(`Backup file not found: ${backupPath}`);
      }
      this.logger.debug(`Backup file validated: ${backupPath}`);

      // Create temp directory for extraction
      progressCallback?.(10, 'Creating temporary directory...');
      const tempRestoreDir = path.join(config.tempDir, 'restore');
      this.logger.debug(`Creating temporary restore directory: ${tempRestoreDir}`);
      await this.ensureDirectory(tempRestoreDir);

      // Extract backup
      progressCallback?.(20, 'Extracting backup...');
      this.logger.debug('Starting archive extraction');
      await this.compressionService.extractArchive(
        backupPath,
        tempRestoreDir,
        progressCallback
      );
      this.logger.debug('Archive extraction completed');

      // Restore files to WoW directory
      progressCallback?.(70, 'Restoring files to WoW directory...');
      this.logger.debug('Starting file restoration to WoW directory');
      await this.restoreWoWFiles(config, tempRestoreDir, progressCallback);
      this.logger.debug('File restoration completed');

      // Clean up temp directory
      progressCallback?.(90, 'Cleaning up...');
      await this.cleanupTempDirectory(tempRestoreDir);

      progressCallback?.(100, 'Restore completed successfully!');
      this.logger.info('=== Restore Completed Successfully ===');
      
    } catch (error) {
      this.logger.error(`Restore operation failed: ${error}`);
      this.logger.debug(`Restore failure details:`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private validatePaths(config: any): void {
    const wowPath = path.join(config.wowPath, config.wowVersion);
    
    if (!fs.existsSync(config.wowPath)) {
      throw new Error(`WoW installation path not found: ${config.wowPath}`);
    }

    if (!fs.existsSync(wowPath)) {
      throw new Error(`WoW version folder not found: ${wowPath}`);
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    await fsPromises.mkdir(dirPath, { recursive: true });
  }

  private async copyWoWFiles(
    config: any,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    const sourcePath = path.join(config.wowPath, config.wowVersion);
    const destPath = config.tempDir;

    // Folders to backup
    const foldersToBackup = ['Interface', 'WTF', 'Screenshots'];
    let currentProgress = 20;
    const progressPerFolder = 50 / foldersToBackup.length;

    for (const folder of foldersToBackup) {
      const sourceFolder = path.join(sourcePath, folder);
      const destFolder = path.join(destPath, folder);

      if (fs.existsSync(sourceFolder)) {
        progressCallback?.(currentProgress, `Copying ${folder}...`);
        
        try {
          if (process.platform === 'win32') {
            // Use robocopy on Windows for faster copying
            await this.robocopyFolder(sourceFolder, destFolder);
          } else {
            // Use Node.js fs for more reliable copying on macOS/Linux
            await this.copyFolderRecursive(sourceFolder, destFolder);
          }
          
          this.logger.info(`Copied ${folder} folder`);
        } catch (error) {
          this.logger.error(`Failed to copy ${folder} folder: ${error}`);
          throw new Error(`Failed to copy ${folder} folder: ${error}`);
        }
      } else {
        this.logger.warn(`${folder} folder not found, skipping`);
      }
      
      currentProgress += progressPerFolder;
    }
  }

  private async copyFolderRecursive(source: string, destination: string): Promise<void> {
    await fsPromises.mkdir(destination, { recursive: true });
    
    const entries = await fsPromises.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      
      try {
        if (entry.isDirectory()) {
          await this.copyFolderRecursive(sourcePath, destPath);
        } else {
          await fsPromises.copyFile(sourcePath, destPath);
        }
      } catch (error) {
        this.logger.warn(`Failed to copy ${sourcePath}: ${error}`);
        // Continue with other files instead of failing completely
      }
    }
  }

  private async robocopyFolder(source: string, dest: string): Promise<void> {
    const command = `robocopy "${source}" "${dest}" /E /MT:32 /R:1 /W:1 /NFL /NDL /NJH /NJS`;
    
    try {
      await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
    } catch (error: any) {
      // Robocopy exit codes 0-7 are success codes
      if (error.code && error.code <= 7) {
        return; // Success
      }
      throw error;
    }
  }

  private async rsyncFolder(source: string, dest: string): Promise<void> {
    const command = `rsync -av "${source}/" "${dest}/"`;
    await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
  }

  private async restoreWoWFiles(
    config: any,
    sourceDir: string,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<void> {
    const destPath = path.join(config.wowPath, config.wowVersion);
    const foldersToRestore = ['Interface', 'WTF', 'Screenshots'];
    
    let currentProgress = 70;
    const progressPerFolder = 20 / foldersToRestore.length;

    for (const folder of foldersToRestore) {
      const sourceFolder = path.join(sourceDir, folder);
      const destFolder = path.join(destPath, folder);

      if (fs.existsSync(sourceFolder)) {
        progressCallback?.(currentProgress, `Restoring ${folder}...`);
        
        // Remove existing folder if it exists (no backup needed during restore)
        if (fs.existsSync(destFolder)) {
          await fsPromises.rm(destFolder, { recursive: true, force: true });
          this.logger.info(`Removed existing ${folder} folder`);
        }

        // Copy restored files
        if (process.platform === 'win32') {
          await this.robocopyFolder(sourceFolder, destFolder);
        } else {
          await this.rsyncFolder(sourceFolder, destFolder);
        }
        
        this.logger.info(`Restored ${folder} folder`);
      }
      
      currentProgress += progressPerFolder;
    }
  }

  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
      this.logger.info('Cleaned up temporary directory');
    } catch (error) {
      this.logger.warn(`Failed to clean up temp directory: ${error}`);
    }
  }

  private async cleanOldBackups(config: any): Promise<void> {
    const backupDir = config.backupDir;
    const retentionDays = config.backupRetention || 30;
    
    try {
      // Ensure backup directory exists before trying to read it
      if (!fs.existsSync(backupDir)) {
        this.logger.info('Backup directory does not exist yet, skipping cleanup');
        return;
      }

      const files = await fsPromises.readdir(backupDir);
      const backupFiles = files.filter(f => f.startsWith('WoW-Backup-') && f.endsWith('.zip'));
      
      if (backupFiles.length === 0) {
        this.logger.info('No backup files found to clean up');
        return;
      }

      const now = Date.now();
      const maxAge = retentionDays * 24 * 60 * 60 * 1000;
      
      for (const file of backupFiles) {
        const filePath = path.join(backupDir, file);
        try {
          const stats = await fsPromises.stat(filePath);
          const age = now - stats.mtime.getTime();
          
          if (age > maxAge) {
            this.logger.debug(`Deleting old backup file: ${file} (age: ${Math.round(age / (24 * 60 * 60 * 1000))} days)`);
            await fsPromises.unlink(filePath);
            this.logger.info(`Deleted old backup: ${file}`);
          } else {
            this.logger.debug(`Keeping backup file: ${file} (age: ${Math.round(age / (24 * 60 * 60 * 1000))} days)`);
          }
        } catch (fileError) {
          this.logger.warn(`Failed to process backup file ${file}: ${fileError}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to clean old backups: ${error}`);
    }
  }

  private generateBackupFileName(): string {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, '-')
      .replace(/:/g, '')
      .replace(/\..+/, '');
    return `WoW-Backup-${timestamp}.zip`;
  }

  isBackupRunning(): boolean {
    return this.isRunning;
  }

  private async countFilesInDirectory(dirPath: string): Promise<number> {
    let count = 0;
    
    try {
      const items = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          count += await this.countFilesInDirectory(itemPath);
        } else {
          count++;
        }
      }
    } catch (error) {
      this.logger.debug(`Error counting files in ${dirPath}: ${error}`);
    }
    
    return count;
  }
}