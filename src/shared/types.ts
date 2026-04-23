export type WowFlavor =
  | '_retail_'
  | '_classic_'
  | '_classic_era_'
  | '_ptr_'
  | '_beta_'
  | '_classic_ptr_';

export type RetentionMode =
  /** Keep all backups from the last 7 days, 1/week for a month, 1/month for a year, 1/year beyond. */
  | 'time-machine'
  /** Simply keep the N most recent backups per flavor. */
  | 'count';

export const WOW_FLAVORS: WowFlavor[] = [
  '_retail_',
  '_classic_',
  '_classic_era_',
  '_ptr_',
  '_beta_',
  '_classic_ptr_'
];

export interface SmbMountConfig {
  /** e.g. "fileserver.local" or "192.168.1.50" */
  host: string;
  /** e.g. "wowbackups" */
  share: string;
  username?: string;
  /** Stored in OS keychain when possible; plain in config file as fallback. */
  password?: string;
  /** Where the share should be mounted locally. If empty, OS default is used. */
  mountPoint?: string;
  /** Auto-mount on app start */
  autoMountOnLaunch: boolean;
  /** Auto-upload newly created backups after a backup completes. */
  autoUploadAfterBackup: boolean;
}

export type ScheduleMode = 'interval' | 'daily' | 'custom';

export interface ScheduleConfig {
  /** Whether scheduled automatic backups are enabled. */
  enabled: boolean;
  /** Which scheduling mode to use. */
  mode: ScheduleMode;
  /** For 'interval' mode: hours between backups (e.g. 1, 2, 4, 6, 12, 24). */
  intervalHours: number;
  /** For 'daily' mode: time in "HH:MM" 24-hour format (e.g. "02:00"). */
  dailyTime: string;
  /** For 'custom' mode: a standard 5-field cron expression (e.g. "0 * /6 * * *" without the space). */
  cronExpression: string;
}

export interface SchedulerStatus {
  /** Whether the scheduler is currently active. */
  running: boolean;
  /** ISO string of the last completed backup run, if any. */
  lastRunIso?: string;
  /** ISO string of the next scheduled run, if known. */
  nextRunIso?: string;
  /** The resolved 5-field cron expression currently in use. */
  cronExpression?: string;
  /** Last error message from a scheduled run, if any. */
  lastError?: string;
  /** ISO of the last error, if any. */
  lastErrorIso?: string;
}

export interface AppConfig {
  /** Path to the WoW install root (the folder that contains _retail_, _classic_, etc.) */
  wowInstallRoot: string;
  /** Flavors the user has opted-in to back up / restore. */
  enabledFlavors: WowFlavor[];
  /** Local folder where backup .zip files are written. */
  localBackupDir: string;
  /** How many backups to keep per flavor before pruning the oldest (used when retentionMode = 'count'). */
  retentionCount: number;
  /** Which retention strategy to use: Time Machine style tiers or a simple fixed count. */
  retentionMode: RetentionMode;
  /** SMB share config + auto-mount toggle. */
  smb: SmbMountConfig;
  /** Automatic scheduled backup configuration. */
  schedule: ScheduleConfig;
  /**
   * When enabled, the app periodically checks the remote share for backups
   * created by other machines. If a newer one is found the user is prompted
   * to download and restore it automatically.
   */
  autoSyncFromRemote: boolean;
  /**
   * How often (in minutes) to poll the remote share for newer backups.
   * Only used when `autoSyncFromRemote` is enabled.
   * Allowed values: 5, 15, 30, 60, 120, 240, 720, 1440.
   */
  syncIntervalMinutes: number;
  /**
   * When enabled, newer remote backups from other machines are downloaded and
   * restored silently without prompting. Requires `autoSyncFromRemote`.
   */
  autoInstallSyncBackup: boolean;
}

export interface BackupFile {
  /** Absolute path on disk. */
  path: string;
  /** Bare file name. */
  name: string;
  flavor: WowFlavor | 'unknown';
  sizeBytes: number;
  createdAtIso: string;
  /** Sidecar metadata if available (loaded for remote listings). */
  meta?: BackupMeta;
}

export interface BackupError {
  flavor: WowFlavor | 'unknown';
  message: string;
}

export interface BackupRunResult {
  created: BackupFile[];
  errors: BackupError[];
}

export interface MachineInfo {
  hostname: string;
  username: string;
  platform: NodeJS.Platform;
  arch: string;
  osRelease: string;
  /** First non-internal IPv4 address found, if any. */
  primaryIp?: string;
  /** All non-internal IPv4 addresses, keyed by interface name. */
  ipv4Addresses: Record<string, string[]>;
  /** App version from package.json */
  appVersion: string;
}

export interface BackupMeta {
  /** Schema version for this metadata file. */
  schemaVersion: 1;
  /** Bare file name of the .zip this metadata describes. */
  file: string;
  flavor: WowFlavor | 'unknown';
  sizeBytes: number;
  /** SHA-256 of the .zip content. */
  sha256: string;
  /** Number of entries in the zip (addons + WTF files). */
  entryCount?: number;
  /** When the backup zip was created. */
  createdAtIso: string;
  /** When this metadata file was written (e.g. on upload). */
  uploadedAtIso?: string;
  /** Source machine that produced the backup. */
  source: MachineInfo;
  /** WoW install root the backup was taken from. */
  wowInstallRoot: string;
  /** Optional user-supplied note. */
  note?: string;
}

export interface RemoteIndex {
  schemaVersion: 1;
  updatedAtIso: string;
  entries: BackupMeta[];
}

/** Describes a remote backup from another machine that is newer than what was last synced. */
export interface SyncAvailableInfo {
  /** Bare filename of the remote .zip (e.g. "wow-addons__retail__2024-11-15_02-30-00.zip"). */
  remoteName: string;
  flavor: WowFlavor | 'unknown';
  /** ISO timestamp the backup was created on the source machine. */
  createdAtIso: string;
  /** Hostname of the machine that created the backup. */
  sourceHostname: string;
  sizeBytes: number;
}

export interface ProgressEvent {
  id: string;
  phase: 'start' | 'progress' | 'done' | 'error';
  label: string;
  /** 0..1 when known */
  ratio?: number;
  message?: string;
}

export interface MountStatus {
  mounted: boolean;
  mountPath?: string;
  message?: string;
}

export type IpcChannel =
  | 'config:get'
  | 'config:set'
  | 'dialog:pickDirectory'
  | 'backup:run'
  | 'backup:listLocal'
  | 'backup:delete'
  | 'smb:mount'
  | 'smb:unmount'
  | 'smb:status'
  | 'remote:list'
  | 'remote:upload'
  | 'remote:download'
  | 'restore:fromZip'
  | 'remote:syncApply'
  | 'remote:syncDismiss'
  | 'remote:syncAvailable'
  | 'remote:syncApplied'
  | 'scheduler:getStatus'
  | 'scheduler:runNow'
  | 'update:install'
  | 'update:available'
  | 'update:progress'
  | 'update:downloaded'
  | 'shell:showInFolder'
  | 'shell:openPath'
  | 'remote:meta'
  | 'remote:rebuildIndex'
  | 'progress';
