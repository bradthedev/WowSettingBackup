import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { AppConfig, WowFlavor } from '../shared/types';
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
    smb: {
      host: '',
      share: '',
      username: '',
      password: '',
      mountPoint: defaultMountPoint(),
      autoMountOnLaunch: false
    }
  };
}

function sanitize(raw: Partial<AppConfig>): AppConfig {
  const base = defaultConfig();
  const merged: AppConfig = {
    ...base,
    ...raw,
    smb: { ...base.smb, ...(raw.smb ?? {}) }
  };
  // Filter to known flavors only.
  merged.enabledFlavors = (merged.enabledFlavors ?? []).filter((f) =>
    WOW_FLAVORS.includes(f)
  );
  if (merged.enabledFlavors.length === 0) merged.enabledFlavors = ['_retail_'];
  if (!Number.isFinite(merged.retentionCount) || merged.retentionCount < 1) {
    merged.retentionCount = 10;
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
    smb: { ...current.smb, ...(patch.smb ?? {}) }
  });
}
