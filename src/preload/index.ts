import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  BackupFile,
  BackupRunResult,
  BackupMeta,
  MountStatus,
  ProgressEvent,
  RemoteIndex,
  SchedulerStatus,
  SyncAvailableInfo,
  WowFlavor
} from '../shared/types';

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:set', patch),

  pickDirectory: (title?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDirectory', title),

  runBackup: (flavors: WowFlavor[]): Promise<BackupRunResult> =>
    ipcRenderer.invoke('backup:run', flavors),
  listLocalBackups: (): Promise<BackupFile[]> =>
    ipcRenderer.invoke('backup:listLocal'),
  deleteBackup: (absPath: string): Promise<void> =>
    ipcRenderer.invoke('backup:delete', absPath),

  smbMount: (): Promise<MountStatus> => ipcRenderer.invoke('smb:mount'),
  smbUnmount: (): Promise<MountStatus> => ipcRenderer.invoke('smb:unmount'),
  smbStatus: (): Promise<MountStatus> => ipcRenderer.invoke('smb:status'),

  listRemoteBackups: (): Promise<BackupFile[]> =>
    ipcRenderer.invoke('remote:list'),
  uploadBackup: (absPath: string): Promise<void> =>
    ipcRenderer.invoke('remote:upload', absPath),
  downloadBackup: (remoteName: string): Promise<string> =>
    ipcRenderer.invoke('remote:download', remoteName),
  getRemoteMeta: (remoteName: string): Promise<BackupMeta | undefined> =>
    ipcRenderer.invoke('remote:meta', remoteName),
  rebuildRemoteIndex: (): Promise<RemoteIndex> =>
    ipcRenderer.invoke('remote:rebuildIndex'),

  restoreFromZip: (absZipPath: string): Promise<void> =>
    ipcRenderer.invoke('restore:fromZip', absZipPath),

  getSchedulerStatus: (): Promise<SchedulerStatus> =>
    ipcRenderer.invoke('scheduler:getStatus'),
  runScheduledBackupNow: (): Promise<void> =>
    ipcRenderer.invoke('scheduler:runNow'),

  onUpdateAvailable: (cb: (version: string) => void) => {
    const listener = (_: unknown, version: string) => cb(version);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.off('update:available', listener);
  },
  onUpdateProgress: (cb: (percent: number) => void) => {
    const listener = (_: unknown, percent: number) => cb(percent);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.off('update:progress', listener);
  },
  onUpdateDownloaded: (cb: (version: string) => void) => {
    const listener = (_: unknown, version: string) => cb(version);
    ipcRenderer.on('update:downloaded', listener);
    return () => ipcRenderer.off('update:downloaded', listener);
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),

  /** Called when the main process detects newer remote backups from other machines. */
  onSyncAvailable: (cb: (items: SyncAvailableInfo[]) => void) => {
    const listener = (_: unknown, items: SyncAvailableInfo[]) => cb(items);
    ipcRenderer.on('remote:syncAvailable', listener);
    return () => ipcRenderer.off('remote:syncAvailable', listener);
  },
  /** Download and restore the given remote backup, then record it as synced. */
  applySyncBackup: (info: SyncAvailableInfo): Promise<void> =>
    ipcRenderer.invoke('remote:syncApply', info),
  /** Mark the backup as seen without restoring so the banner won't reappear. */
  dismissSyncBackup: (info: SyncAvailableInfo): Promise<void> =>
    ipcRenderer.invoke('remote:syncDismiss', info),
  /** Fired when a sync backup has been auto-installed silently. */
  onSyncApplied: (cb: (info: SyncAvailableInfo) => void) => {
    const listener = (_: unknown, info: SyncAvailableInfo) => cb(info);
    ipcRenderer.on('remote:syncApplied', listener);
    return () => ipcRenderer.off('remote:syncApplied', listener);
  },

  showInFolder: (absPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:showInFolder', absPath),
  openPath: (absPath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openPath', absPath),

  onProgress: (cb: (e: ProgressEvent) => void) => {
    const listener = (_: unknown, e: ProgressEvent) => cb(e);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.off('progress', listener);
  }
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
