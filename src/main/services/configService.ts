import Store from 'electron-store';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';

export interface AppConfig {
  wowPath: string;
  wowVersion: '_retail_' | '_classic_' | '_classic_era_' | '_ptr_' | '_beta_';
  backupDir: string;
  backupRetention: number;
  compressionLevel: number;
  schedulerEnabled: boolean;
  schedulerIntervalMinutes: number;
  syncRole: 'host' | 'slave' | 'none';
  syncPort: number;
  deviceId: string;
  deviceName: string;
  autoSyncOnConnect: boolean;
  googleDriveEnabled: boolean;
  googleDriveTokens?: { accessToken: string; refreshToken: string; expiryDate?: number };
  dropboxEnabled: boolean;
  dropboxTokens?: { accessToken: string; refreshToken: string; expiryDate?: number };
  cloudBackupFolder: string;
  minimizeToTray: boolean;
  theme: 'dark';
}

function getDefaultWowPath(): string {
  if (process.platform === 'darwin') {
    return '/Applications/World of Warcraft/';
  }
  return 'C:\\Program Files (x86)\\World of Warcraft\\';
}

function getDefaultBackupDir(): string {
  return path.join(os.homedir(), 'WoWBackups');
}

export class ConfigService {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'wow-settings-backup-config',
      defaults: {
        wowPath: getDefaultWowPath(),
        wowVersion: '_retail_',
        backupDir: getDefaultBackupDir(),
        backupRetention: 30,
        compressionLevel: 1,
        schedulerEnabled: false,
        schedulerIntervalMinutes: 60,
        syncRole: 'none',
        syncPort: 9400,
        deviceId: randomUUID(),
        deviceName: os.hostname(),
        autoSyncOnConnect: false,
        googleDriveEnabled: false,
        dropboxEnabled: false,
        cloudBackupFolder: 'WoWSettingsBackup',
        minimizeToTray: false,
        theme: 'dark',
      },
    });
  }

  getAll(): AppConfig {
    return this.store.store;
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.store.set(key, value);
  }

  update(partial: Partial<AppConfig>): void {
    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined) {
        this.store.set(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
      }
    }
  }

  detectWowPath(): string | null {
    const candidates: string[] = [];

    if (process.platform === 'darwin') {
      candidates.push(
        '/Applications/World of Warcraft/',
        path.join(os.homedir(), 'Applications/World of Warcraft/'),
      );
    } else if (process.platform === 'win32') {
      candidates.push(
        'C:\\Program Files (x86)\\World of Warcraft\\',
        'C:\\Program Files\\World of Warcraft\\',
        'D:\\World of Warcraft\\',
        'D:\\Games\\World of Warcraft\\',
      );
    } else {
      candidates.push(
        path.join(os.homedir(), 'Games/World of Warcraft/'),
        path.join(os.homedir(), '.wine/drive_c/Program Files (x86)/World of Warcraft/'),
      );
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
