import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { AppConfig, RetentionMode, ScheduleConfig, WowFlavor } from '../shared/types';
import { WOW_FLAVORS } from '../shared/types';

const CONFIG_FILE = 'config.json';

function configPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

function defaultWowInstallRoot(): string {
  if (process.platform === 'win32') {
    return 'C:\\Program Files (x86)\\World of Warcraft';
  }
  if (process.platform === 'darwin') {
    return '/Applications/World of Warcraft';
  }
  return path.join(app.getPath('home'), 'World of Warcraft');
}

function defaultLocalBackupDir(): string {
  return path.join(app.getPath('documents'), 'WowSettingBackup');
}

function defaultMountPoint(): string {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'mnt', 'wowbackups');
  }
  if (process.platform === 'win32') return 'Z:';
  return path.join(app.getPath('home'), 'mnt', 'wowbackups');
}

export function defaultConfig(): AppConfig {
  return {
    wowInstallRoot: defaultWowInstallRoot(),
    enabledFlavors: ['_retail_'] as WowFlavor[],
    localBackupDir: defaultLocalBackupDir(),
    retentionCount: 10,
    retentionMode: 'time-machine' as RetentionMode,
    smb: {
      host: '',
      share: '',
      username: '',
      password: '',
      mountPoint: defaultMountPoint(),
      autoMountOnLaunch: false,
      autoUploadAfterBackup: false
    },
    schedule: {
      enabled: false,
      mode: 'interval',
      intervalHours: 6,
      dailyTime: '02:00',
      cronExpression: ''
    },
    autoSyncFromRemote: false,
    syncIntervalMinutes: 240,
    autoInstallSyncBackup: false
  };
}

function sanitizeSchedule(raw: Partial<ScheduleConfig>): ScheduleConfig {
  const base = defaultConfig().schedule;
  const merged: ScheduleConfig = { ...base, ...raw };
  if (!['interval', 'daily', 'custom'].includes(merged.mode)) {
    merged.mode = 'interval';
  }
  if (!Number.isFinite(merged.intervalHours) || merged.intervalHours < 1) {
    merged.intervalHours = 6;
  }
  if (!/^\d{1,2}:\d{2}$/.test(merged.dailyTime)) {
    merged.dailyTime = '02:00';
  }
  return merged;
}

function sanitize(raw: Partial<AppConfig>): AppConfig {
  const base = defaultConfig();
  const merged: AppConfig = {
    ...base,
    ...raw,
    smb: { ...base.smb, ...(raw.smb ?? {}) },
    schedule: sanitizeSchedule(raw.schedule ?? {})
  };
  // Filter to known flavors only.
  merged.enabledFlavors = (merged.enabledFlavors ?? []).filter((f) =>
    WOW_FLAVORS.includes(f)
  );
  if (merged.enabledFlavors.length === 0) merged.enabledFlavors = ['_retail_'];
  if (!Number.isFinite(merged.retentionCount) || merged.retentionCount < 1) {
    merged.retentionCount = 10;
  }
  if (!(['time-machine', 'count'] as RetentionMode[]).includes(merged.retentionMode)) {
    merged.retentionMode = 'time-machine';
  }
  if (typeof merged.autoSyncFromRemote !== 'boolean') {
    merged.autoSyncFromRemote = false;
  }
  const ALLOWED_SYNC_INTERVALS = [5, 15, 30, 60, 120, 240, 720, 1440];
  if (
    !Number.isFinite(merged.syncIntervalMinutes) ||
    !ALLOWED_SYNC_INTERVALS.includes(merged.syncIntervalMinutes)
  ) {
    merged.syncIntervalMinutes = 240;
  }
  if (typeof merged.autoInstallSyncBackup !== 'boolean') {
    merged.autoInstallSyncBackup = false;
  }
  return merged;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const p = configPath();
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<AppConfig>;
      cached = sanitize(raw);
      return cached;
    }
  } catch (err) {
    console.error('Failed to read config; using defaults.', err);
  }
  cached = defaultConfig();
  saveConfig(cached);
  return cached;
}

export function saveConfig(cfg: AppConfig): AppConfig {
  const clean = sanitize(cfg);
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(clean, null, 2), 'utf-8');
  cached = clean;
  return clean;
}

export function patchConfig(patch: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  return saveConfig({
    ...current,
    ...patch,
    smb: { ...current.smb, ...(patch.smb ?? {}) },
    schedule: { ...current.schedule, ...(patch.schedule ?? {}) }
  });
}
