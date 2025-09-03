import Store from 'electron-store';
import path from 'path';
import os from 'os';

export interface BackupConfig {
  wowVersion: string;
  wowPath: string;
  tempDir: string;
  backupDir: string;
  backupRetention: number;
  verboseLogging: boolean;
  fastCompression: boolean;
  compressionLevel: 'store' | 'fastest' | 'fast' | 'normal' | 'maximum';
  schedulerEnabled: boolean;
  scheduleInterval: number;
  scheduleUnit: 'minutes' | 'hours' | 'days';
  minimizeToTray: boolean;
  runInBackground: boolean;
  use7zip: boolean;
  compressionThreads: number;
  lastScheduledBackup?: string; // ISO date string
  lastManualBackup?: string; // ISO date string
}

export class ConfigService {
  private store: Store<BackupConfig>;
  private defaultConfig: BackupConfig;

  constructor() {
    this.store = new Store<BackupConfig>({
      name: 'wow-backup-config',
      defaults: this.getDefaultConfig()
    });
    this.defaultConfig = this.getDefaultConfig();
  }

  private getDefaultConfig(): BackupConfig {
    const platform = process.platform;
    let defaultWowPath = '';
    
    if (platform === 'win32') {
      defaultWowPath = 'C:\\Program Files (x86)\\World of Warcraft';
    } else if (platform === 'darwin') {
      defaultWowPath = '/Applications/World of Warcraft';
    } else {
      defaultWowPath = path.join(os.homedir(), 'Games', 'World of Warcraft');
    }

    return {
      wowVersion: '_retail_',
      wowPath: defaultWowPath,
      tempDir: path.join(os.tmpdir(), 'wow-backup-temp'),
      backupDir: path.join(os.homedir(), 'WoW-Backups'),
      backupRetention: 30,
      verboseLogging: false,
      fastCompression: true,
      compressionLevel: 'fast',
      schedulerEnabled: false,
      scheduleInterval: 1,
      scheduleUnit: 'hours',
      minimizeToTray: true,
      runInBackground: true,
      use7zip: false,
      compressionThreads: Math.min(16, os.cpus().length),
      lastScheduledBackup: undefined,
      lastManualBackup: undefined
    };
  }

  getConfig(): BackupConfig {
    return this.store.store;
  }

  saveConfig(config: Partial<BackupConfig>): void {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...config };
    this.store.store = newConfig;
  }

  getConfigValue<K extends keyof BackupConfig>(key: K): BackupConfig[K] {
    return this.store.get(key);
  }

  setConfigValue<K extends keyof BackupConfig>(key: K, value: BackupConfig[K]): void {
    this.store.set(key, value);
  }

  resetConfig(): void {
    this.store.store = this.defaultConfig;
  }

  getConfigPath(): string {
    return this.store.path;
  }

  updateLastBackupTime(type: 'scheduled' | 'manual'): void {
    const now = new Date().toISOString();
    if (type === 'scheduled') {
      this.setConfigValue('lastScheduledBackup', now);
    } else {
      this.setConfigValue('lastManualBackup', now);
    }
  }

  getLastBackupTime(type: 'scheduled' | 'manual'): Date | null {
    const timeStr = type === 'scheduled' 
      ? this.getConfigValue('lastScheduledBackup')
      : this.getConfigValue('lastManualBackup');
    
    if (!timeStr) return null;
    
    try {
      const date = new Date(timeStr);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }
}