export type TabId = 'dashboard' | 'backup' | 'cloud' | 'sync' | 'settings' | 'logs';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: string;
}

export interface BackupHistoryItem {
  id: string;
  name: string;
  path: string;
  size: number;
  date: string;
  type: 'manual' | 'scheduled' | 'pre-restore';
  status: 'success' | 'failed';
  duration: number;
}

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
  googleDriveTokens?: OAuthTokens;
  dropboxEnabled: boolean;
  dropboxTokens?: OAuthTokens;
  cloudBackupFolder: string;
  minimizeToTray: boolean;
  theme: 'dark';
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate?: number;
}

export interface SchedulerStatus {
  running: boolean;
  nextRunTime?: string;
  lastRunTime?: string;
}

export interface CloudStatus {
  connected: boolean;
  email?: string;
  lastSync?: string;
}

export interface CloudFile {
  id: string;
  name: string;
  size: number;
  modifiedTime: string;
  provider: 'google' | 'dropbox';
}

export interface DiscoveredHost {
  id: string;
  name: string;
  address: string;
  port: number;
  wowVersion: string;
  backupTimestamp?: string;
}

export interface PairedDevice {
  id: string;
  name: string;
  lastSeen: string;
  paired: boolean;
}

export interface SyncProgress {
  phase: 'connecting' | 'authenticating' | 'transferring' | 'applying' | 'complete' | 'error';
  progress: number;
  message: string;
  bytesTransferred?: number;
  totalBytes?: number;
}

export interface KnownHost {
  id: string;
  name: string;
  address: string;
  lastConnected: string;
}

export interface RemoteBackup {
  id: string;
  name: string;
  size: number;
  date: string;
  wowVersion: string;
}

// Electron API type for window.electronAPI
export interface IElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  app: {
    getPlatform: () => Promise<string>;
    getHostname: () => Promise<string>;
  };
  config: {
    get: () => Promise<AppConfig>;
    save: (config: Partial<AppConfig>) => Promise<void>;
    selectDirectory: () => Promise<string | null>;
    detectWowPath: () => Promise<string | null>;
  };
  backup: {
    run: () => Promise<BackupResult>;
    restore: (path: string) => Promise<RestoreResult>;
    getHistory: () => Promise<BackupHistoryItem[]>;
    deleteHistory: (id: string) => Promise<void>;
  };
  scheduler: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    getStatus: () => Promise<SchedulerStatus>;
  };
  cloud: {
    authenticate: (provider: 'google' | 'dropbox') => Promise<void>;
    disconnect: (provider: 'google' | 'dropbox') => Promise<void>;
    getStatus: (provider: 'google' | 'dropbox') => Promise<CloudStatus>;
    upload: (backupId: string, provider: 'google' | 'dropbox') => Promise<void>;
    download: (remoteId: string, provider: 'google' | 'dropbox') => Promise<void>;
    listRemote: (provider: 'google' | 'dropbox') => Promise<CloudFile[]>;
  };
  sync: {
    startHost: () => Promise<{ port: number }>;
    stopHost: () => Promise<void>;
    generatePin: () => Promise<{ pin: string }>;
    getPairedDevices: () => Promise<PairedDevice[]>;
    revokeDevice: (id: string) => Promise<void>;
    browseHosts: () => Promise<void>;
    stopBrowsing: () => Promise<void>;
    connectToHost: (address: string) => Promise<void>;
    pairWithPin: (pin: string) => Promise<void>;
    requestBackupList: () => Promise<RemoteBackup[]>;
    startTransfer: (backupId: string) => Promise<void>;
    cancelTransfer: () => Promise<void>;
    getKnownHosts: () => Promise<KnownHost[]>;
    forgetHost: (id: string) => Promise<void>;
  };
  logs: {
    read: (maxLines?: number) => Promise<LogEntry[]>;
    getDir: () => Promise<string>;
  };
  onProgressUpdate: (cb: (progress: number, message: string) => void) => () => void;
  onSyncHostFound: (cb: (host: DiscoveredHost) => void) => () => void;
  onSyncHostLost: (cb: (hostId: string) => void) => () => void;
  onSyncProgress: (cb: (data: SyncProgress) => void) => () => void;
  onSyncStateChange: (cb: (state: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
