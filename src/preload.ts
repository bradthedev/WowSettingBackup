import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // App info
  app: {
    getPlatform: () => ipcRenderer.invoke('app:platform'),
    getHostname: () => ipcRenderer.invoke('app:hostname'),
  },

  // Config (stub for Phase 1, will be expanded in Phase 2)
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (config: Record<string, unknown>) => ipcRenderer.invoke('config:save', config),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    detectWowPath: () => ipcRenderer.invoke('config:detectWowPath'),
  },

  // Backup (stub for Phase 1)
  backup: {
    run: () => ipcRenderer.invoke('backup:run'),
    restore: (backupPath: string) => ipcRenderer.invoke('backup:restore', backupPath),
    getHistory: () => ipcRenderer.invoke('backup:getHistory'),
    deleteHistory: (id: string) => ipcRenderer.invoke('backup:deleteHistory', id),
  },

  // Scheduler (stub)
  scheduler: {
    start: () => ipcRenderer.invoke('scheduler:start'),
    stop: () => ipcRenderer.invoke('scheduler:stop'),
    getStatus: () => ipcRenderer.invoke('scheduler:getStatus'),
  },

  // Cloud (stub)
  cloud: {
    authenticate: (provider: string) => ipcRenderer.invoke('cloud:authenticate', provider),
    disconnect: (provider: string) => ipcRenderer.invoke('cloud:disconnect', provider),
    getStatus: (provider: string) => ipcRenderer.invoke('cloud:getStatus', provider),
    upload: (backupId: string, provider: string) => ipcRenderer.invoke('cloud:upload', backupId, provider),
    download: (remoteId: string, provider: string) => ipcRenderer.invoke('cloud:download', remoteId, provider),
    listRemote: (provider: string) => ipcRenderer.invoke('cloud:listRemote', provider),
  },

  // Sync (stub)
  sync: {
    startHost: () => ipcRenderer.invoke('sync:startHost'),
    stopHost: () => ipcRenderer.invoke('sync:stopHost'),
    generatePin: () => ipcRenderer.invoke('sync:generatePin'),
    getPairedDevices: () => ipcRenderer.invoke('sync:getPairedDevices'),
    revokeDevice: (id: string) => ipcRenderer.invoke('sync:revokeDevice', id),
    browseHosts: () => ipcRenderer.invoke('sync:browseHosts'),
    stopBrowsing: () => ipcRenderer.invoke('sync:stopBrowsing'),
    connectToHost: (address: string) => ipcRenderer.invoke('sync:connectToHost', address),
    pairWithPin: (pin: string) => ipcRenderer.invoke('sync:pairWithPin', pin),
    requestBackupList: () => ipcRenderer.invoke('sync:requestBackupList'),
    startTransfer: (backupId: string) => ipcRenderer.invoke('sync:startTransfer', backupId),
    cancelTransfer: () => ipcRenderer.invoke('sync:cancelTransfer'),
    getKnownHosts: () => ipcRenderer.invoke('sync:getKnownHosts'),
    forgetHost: (id: string) => ipcRenderer.invoke('sync:forgetHost', id),
  },

  // Logs
  logs: {
    read: (maxLines?: number) => ipcRenderer.invoke('logs:read', maxLines),
    getDir: () => ipcRenderer.invoke('logs:getDir'),
  },

  // Events (main → renderer)
  onProgressUpdate: (cb: (progress: number, message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number, message: string) => cb(progress, message);
    ipcRenderer.on('progress:update', handler);
    return () => ipcRenderer.removeListener('progress:update', handler);
  },
  onSyncHostFound: (cb: (host: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, host: unknown) => cb(host);
    ipcRenderer.on('sync:hostFound', handler);
    return () => ipcRenderer.removeListener('sync:hostFound', handler);
  },
  onSyncHostLost: (cb: (hostId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, hostId: string) => cb(hostId);
    ipcRenderer.on('sync:hostLost', handler);
    return () => ipcRenderer.removeListener('sync:hostLost', handler);
  },
  onSyncProgress: (cb: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on('sync:progress', handler);
    return () => ipcRenderer.removeListener('sync:progress', handler);
  },
  onSyncStateChange: (cb: (state: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: string) => cb(state);
    ipcRenderer.on('sync:stateChange', handler);
    return () => ipcRenderer.removeListener('sync:stateChange', handler);
  },
});
