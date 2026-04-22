import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  BackupFile,
  BackupMeta,
  MountStatus,
  ProgressEvent,
  RemoteIndex,
  WowFlavor
} from '../shared/types';

const api = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:set', patch),

  pickDirectory: (title?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDirectory', title),

  runBackup: (flavors: WowFlavor[]): Promise<BackupFile[]> =>
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
