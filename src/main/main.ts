import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, shell, nativeImage } from 'electron';
import path from 'path';
import { BackupService } from './services/backupService';
import { SchedulerService } from './services/schedulerService';
import { ConfigService } from './services/configService';
import { CompressionService } from './services/compressionService';
import { LoggerService } from './services/loggerService';
import { BackupHistoryService } from './services/backupHistoryService';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backupService: BackupService;
let schedulerService: SchedulerService;
let configService: ConfigService;
let compressionService: CompressionService;
let logger: LoggerService;
let backupHistoryService: BackupHistoryService;

const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 750,
    minWidth: 800,
    minHeight: 650,
    frame: false,
    transparent: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: getIconPath(),
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Add error handling
  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed');
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    // Enable dev tools in production for debugging
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', () => {
    const config = configService.getConfig();
    if (config.minimizeToTray && tray) {
      mainWindow?.hide();
    }
  });
}

function getIconPath(): string {
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'assets', 'icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(__dirname, '..', 'assets', 'icon.icns');
  } else {
    return path.join(__dirname, '..', 'assets', 'icon.png');
  }
}

function createTray() {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: 'Run Backup Now',
      click: () => {
        backupService.runBackup();
      }
    },
    { type: 'separator' },
    {
      label: 'Enable Scheduler',
      type: 'checkbox',
      checked: schedulerService.isRunning(),
      click: (item) => {
        if (item.checked) {
          schedulerService.start();
        } else {
          schedulerService.stop();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Open Logs',
      click: () => {
        shell.openPath(logger.getLogPath());
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('WoW Backup Manager');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  // Initialize services
  configService = new ConfigService();
  logger = new LoggerService(configService);
  backupHistoryService = new BackupHistoryService(logger, configService);
  compressionService = new CompressionService(logger);
  backupService = new BackupService(configService, compressionService, logger, backupHistoryService);
  schedulerService = new SchedulerService(backupService, configService, logger);

  createWindow();
  createTray();

  // Auto-start scheduler if enabled
  const config = configService.getConfig();
  if (config.schedulerEnabled) {
    schedulerService.start();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    const config = configService.getConfig();
    if (!config.runInBackground) {
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  schedulerService?.stop();
});

// IPC Handlers
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('config:get', () => {
  return configService.getConfig();
});

ipcMain.handle('config:save', (_, config) => {
  configService.saveConfig(config);
  // Update log level if verboseLogging changed
  if (config.hasOwnProperty('verboseLogging')) {
    logger.updateLogLevel();
  }
  return { success: true };
});

ipcMain.handle('backup:run', async () => {
  try {
    await backupService.runBackup((progress: number, message: string) => {
      mainWindow?.webContents.send('progress:update', { progress, message });
    });
    return { success: true };
  } catch (error) {
    logger.error('Backup failed', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('backup:restore', async (_, backupPath: string) => {
  try {
    await backupService.restoreBackup(backupPath, (progress: number, message: string) => {
      mainWindow?.webContents.send('progress:update', { progress, message });
    });
    return { success: true };
  } catch (error) {
    logger.error('Restore failed', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('scheduler:start', () => {
  schedulerService.start();
  return { success: true };
});

ipcMain.handle('scheduler:stop', () => {
  schedulerService.stop();
  return { success: true };
});

ipcMain.handle('scheduler:status', () => {
  return {
    running: schedulerService.isRunning(),
    nextRun: schedulerService.getNextRunTime()
  };
});

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('dialog:selectFile', async (_, filters?) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('logs:get', async (_, lines: number = 100) => {
  return logger.getRecentLogs(lines);
});

// Backup History handlers
ipcMain.handle('backup-history:get', async () => {
  return backupHistoryService.getValidatedHistory();
});

ipcMain.handle('backup-history:delete', async (_, id: string, deleteFile: boolean = false) => {
  return backupHistoryService.deleteBackup(id, deleteFile);
});

ipcMain.handle('backup-history:clear', async () => {
  backupHistoryService.clearHistory();
  return { success: true };
});

ipcMain.handle('backup-history:stats', async () => {
  return backupHistoryService.getStats();
});

ipcMain.on('log:message', (_, level: string, message: string) => {
  logger.log(level, message);
});

// Progress updates
ipcMain.on('progress:update', (_, progress: number, message: string) => {
  mainWindow?.webContents.send('progress:update', { progress, message });
});

export { mainWindow };