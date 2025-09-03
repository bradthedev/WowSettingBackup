const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Config operations
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    
    // File operations
    selectDirectory: (title) => ipcRenderer.invoke('select-directory', title),
    selectBackupFile: () => ipcRenderer.invoke('select-backup-file'),
    openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
    
    // Backup operations
    performBackup: () => ipcRenderer.invoke('perform-backup'),
    performRestore: (backupFile) => ipcRenderer.invoke('perform-restore', backupFile),
    
    // App operations
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
    
    // Event listeners
    onBackupProgress: (callback) => ipcRenderer.on('backup-progress', (event, data) => callback(data)),
    onRestoreProgress: (callback) => ipcRenderer.on('restore-progress', (event, data) => callback(data)),
    onLogMessage: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
    
    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
