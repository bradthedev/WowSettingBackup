import { contextBridge, ipcRenderer } from 'electron';

export interface IElectronAPI {
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  config: {
    get: () => Promise<any>;
    save: (config: any) => Promise<{ success: boolean }>;
  };
  backup: {
    run: () => Promise<{ success: boolean; error?: string }>;
    restore: (backupPath: string) => Promise<{ success: boolean; error?: string }>;
  };
  backupHistory: {
    get: () => Promise<any[]>;
    delete: (id: string, deleteFile?: boolean) => Promise<boolean>;
    clear: () => Promise<{ success: boolean }>;
    getStats: () => Promise<{
      totalBackups: number;
      totalSize: number;
      totalSizeFormatted: string;
      successfulBackups: number;
      failedBackups: number;
      lastBackupDate?: Date;
    }>;
  };
  scheduler: {
    start: () => Promise<{ success: boolean }>;
    stop: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ running: boolean; nextRun?: Date }>;
  };
  dialog: {
    selectDirectory: () => Promise<string | null>;
    selectFile: (filters?: any) => Promise<string | null>;
  };
  logs: {
    get: (lines?: number) => Promise<string[]>;
    send: (level: string, message: string) => void;
  };
  onProgressUpdate: (callback: (data: { progress: number; message: string }) => void) => void;
  removeProgressListener: () => void;
}

const electronAPI: IElectronAPI = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config) => ipcRenderer.invoke('config:save', config)
  },
  backup: {
    run: () => ipcRenderer.invoke('backup:run'),
    restore: (backupPath) => ipcRenderer.invoke('backup:restore', backupPath)
  },
  backupHistory: {
    get: () => ipcRenderer.invoke('backup-history:get'),
    delete: (id, deleteFile) => ipcRenderer.invoke('backup-history:delete', id, deleteFile),
    clear: () => ipcRenderer.invoke('backup-history:clear'),
    getStats: () => ipcRenderer.invoke('backup-history:stats')
  },
  scheduler: {
    start: () => ipcRenderer.invoke('scheduler:start'),
    stop: () => ipcRenderer.invoke('scheduler:stop'),
    getStatus: () => ipcRenderer.invoke('scheduler:status')
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters)
  },
  logs: {
    get: (lines) => ipcRenderer.invoke('logs:get', lines),
    send: (level, message) => ipcRenderer.send('log:message', level, message)
  },
  onProgressUpdate: (callback) => {
    ipcRenderer.on('progress:update', (_, data) => callback(data));
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('progress:update');
  }
};

contextBridge.exposeInMainWorld('electron', electronAPI);

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}