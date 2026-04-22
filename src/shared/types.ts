export type WowFlavor =
  | '_retail_'
  | '_classic_'
  | '_classic_era_'
  | '_ptr_'
  | '_beta_'
  | '_classic_ptr_';

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
}

export interface AppConfig {
  /** Path to the WoW install root (the folder that contains _retail_, _classic_, etc.) */
  wowInstallRoot: string;
  /** Flavors the user has opted-in to back up / restore. */
  enabledFlavors: WowFlavor[];
  /** Local folder where backup .zip files are written. */
  localBackupDir: string;
  /** How many backups to keep per flavor before pruning the oldest. */
  retentionCount: number;
  /** SMB share config + auto-mount toggle. */
  smb: SmbMountConfig;
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
  | 'progress';
