const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { spawn, exec } = require('child_process');
const archiver = require('archiver');
const { CronJob } = require('node-cron');

interface AppConfig {
  wowPath: string;
  backupPath: string;
  autoBackup: boolean;
  backupSchedule: string;
  keepDays: number;
  compressionLevel: number;
  includeAddons: boolean;
  includeWTF: boolean;
  minimizeToTray: boolean;
  startMinimized: boolean;
}

interface BackupInfo {
  name: string;
  path: string;
  size: number;
  date: Date;
  type: 'manual' | 'scheduled';
}

interface ProgressInfo {
  percent: number;
  current: string;
  total: string;
  stage: string;
}

class WowBackupApp {
  private mainWindow: any | null = null;
  private tray: any | null = null;
  private schedulerJob: any | null = null;
  private isQuiting: boolean = false;
  private config: AppConfig;
  private appDir: string;
  private configPath: string;
  private logPath: string;

  constructor() {
    this.config = this.loadConfig();
    
    // Paths
    this.appDir = app.getAppPath();
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.logPath = path.join(app.getPath('userData'), 'logs');
    
    // Ensure log directory exists
    fs.ensureDirSync(this.logPath);
    
    this.setupApp();
  }

  private setupApp(): void {
    // Handle app ready
    app.whenReady().then(() => {
      this.createWindow();
      this.createTray();
      this.setupScheduler();
    });

    // Handle window closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle activate (macOS)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    // Handle before quit
    app.on('before-quit', () => {
      this.isQuiting = true;
    });

    this.setupIPC();
  }

  private createWindow(): void {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      show: !this.config.startMinimized,
      frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, '../assets/icon.png')
    });

    // Load the app
    this.mainWindow.loadFile('public/index.html');

    // Handle window close
    this.mainWindow.on('close', (event) => {
      if (!this.isQuiting && this.config.minimizeToTray) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Development tools
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools();
    }
  }

  private createTray(): void {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath);
    
    this.tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show WoW Backup Manager',
        click: () => {
          this.showWindow();
        }
      },
      {
        label: 'Quick Backup',
        click: () => {
          this.performBackup('manual');
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => {
          this.showWindow();
          this.mainWindow?.webContents.send('navigate-to', 'settings');
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.isQuiting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setToolTip('WoW Backup Manager');
    this.tray.setContextMenu(contextMenu);
    
    // Handle tray click
    this.tray.on('click', () => {
      this.showWindow();
    });
  }

  private showWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      this.createWindow();
    }
  }

  private setupScheduler(): void {
    if (this.config.autoBackup && this.config.backupSchedule) {
      try {
        this.schedulerJob = new CronJob(
          this.config.backupSchedule,
          () => {
            this.performBackup('scheduled');
          },
          null,
          true,
          'America/New_York' // Adjust timezone as needed
        );
      } catch (error) {
        this.log(`Failed to setup scheduler: ${error}`);
      }
    }
  }

  private loadConfig(): AppConfig {
    const defaultConfig: AppConfig = {
      wowPath: this.findWowPath(),
      backupPath: path.join(os.homedir(), 'WoWBackups'),
      autoBackup: false,
      backupSchedule: '0 2 * * *', // Daily at 2 AM
      keepDays: 30,
      compressionLevel: 6,
      includeAddons: true,
      includeWTF: true,
      minimizeToTray: true,
      startMinimized: false
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const savedConfig = fs.readJsonSync(this.configPath);
        return { ...defaultConfig, ...savedConfig };
      }
    } catch (error) {
      this.log(`Failed to load config: ${error}`);
    }

    return defaultConfig;
  }

  private saveConfig(config: AppConfig): void {
    try {
      this.config = config;
      fs.writeJsonSync(this.configPath, config, { spaces: 2 });
      this.log('Configuration saved successfully');
    } catch (error) {
      this.log(`Failed to save config: ${error}`);
      throw error;
    }
  }

  private findWowPath(): string {
    const possiblePaths = [
      path.join('C:', 'Program Files (x86)', 'World of Warcraft'),
      path.join('C:', 'Program Files', 'World of Warcraft'),
      path.join('C:', 'Games', 'World of Warcraft'),
      path.join(os.homedir(), 'Games', 'World of Warcraft'),
      path.join('D:', 'World of Warcraft'),
      path.join('E:', 'World of Warcraft')
    ];

    for (const wowPath of possiblePaths) {
      if (fs.existsSync(path.join(wowPath, 'Wow.exe')) || 
          fs.existsSync(path.join(wowPath, '_retail_'))) {
        return wowPath;
      }
    }

    return '';
  }

  private async performBackup(type: 'manual' | 'scheduled'): Promise<void> {
    try {
      this.log(`Starting ${type} backup`);
      
      if (!this.config.wowPath || !fs.existsSync(this.config.wowPath)) {
        throw new Error('WoW path not found or invalid');
      }

      // Ensure backup directory exists
      await fs.ensureDir(this.config.backupPath);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `WoW_Backup_${timestamp}.zip`;
      const backupPath = path.join(this.config.backupPath, backupName);

      const archive = archiver('zip', {
        zlib: { level: this.config.compressionLevel }
      });

      const output = fs.createWriteStream(backupPath);
      archive.pipe(output);

      // Track progress
      let totalSize = 0;
      let processedSize = 0;

      // Calculate total size first
      if (this.config.includeAddons) {
        const addonsPath = path.join(this.config.wowPath, 'Interface', 'AddOns');
        if (fs.existsSync(addonsPath)) {
          totalSize += await this.getDirectorySize(addonsPath);
        }
      }

      if (this.config.includeWTF) {
        const wtfPath = path.join(this.config.wowPath, 'WTF');
        if (fs.existsSync(wtfPath)) {
          totalSize += await this.getDirectorySize(wtfPath);
        }
      }

      // Add files to archive
      if (this.config.includeAddons) {
        const addonsPath = path.join(this.config.wowPath, 'Interface', 'AddOns');
        if (fs.existsSync(addonsPath)) {
          this.sendProgress({
            percent: 25,
            current: '0 MB',
            total: `${Math.round(totalSize / 1024 / 1024)} MB`,
            stage: 'Adding AddOns...'
          });
          archive.directory(addonsPath, 'Interface/AddOns');
        }
      }

      if (this.config.includeWTF) {
        const wtfPath = path.join(this.config.wowPath, 'WTF');
        if (fs.existsSync(wtfPath)) {
          this.sendProgress({
            percent: 50,
            current: `${Math.round(processedSize / 1024 / 1024)} MB`,
            total: `${Math.round(totalSize / 1024 / 1024)} MB`,
            stage: 'Adding WTF (Settings)...'
          });
          archive.directory(wtfPath, 'WTF');
        }
      }

      archive.on('progress', (data) => {
        const percent = Math.round((data.fs.processedBytes / totalSize) * 100);
        this.sendProgress({
          percent,
          current: `${Math.round(data.fs.processedBytes / 1024 / 1024)} MB`,
          total: `${Math.round(totalSize / 1024 / 1024)} MB`,
          stage: 'Compressing...'
        });
      });

      return new Promise((resolve, reject) => {
        output.on('close', async () => {
          this.log(`Backup completed: ${backupPath}`);
          this.sendProgress({
            percent: 100,
            current: `${Math.round(totalSize / 1024 / 1024)} MB`,
            total: `${Math.round(totalSize / 1024 / 1024)} MB`,
            stage: 'Complete!'
          });

          // Clean old backups
          await this.cleanOldBackups();
          
          // Refresh backup list
          this.mainWindow?.webContents.send('backup-completed', {
            name: backupName,
            path: backupPath,
            size: archive.pointer(),
            date: new Date(),
            type
          });

          resolve();
        });

        output.on('error', (err) => {
          this.log(`Backup failed: ${err.message}`);
          reject(err);
        });

        archive.finalize();
      });

    } catch (error) {
      this.log(`Backup error: ${error}`);
      this.mainWindow?.webContents.send('backup-error', (error as Error).message);
      throw error;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
    try {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);
        
        if (stat.isDirectory()) {
          size += await this.getDirectorySize(filePath);
        } else {
          size += stat.size;
        }
      }
    } catch (error) {
      this.log(`Error calculating directory size: ${error}`);
    }
    
    return size;
  }

  private async cleanOldBackups(): Promise<void> {
    try {
      const backupFiles = await fs.readdir(this.config.backupPath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.keepDays);

      for (const file of backupFiles) {
        if (file.startsWith('WoW_Backup_') && file.endsWith('.zip')) {
          const filePath = path.join(this.config.backupPath, file);
          const stat = await fs.stat(filePath);
          
          if (stat.mtime < cutoffDate) {
            await fs.remove(filePath);
            this.log(`Removed old backup: ${file}`);
          }
        }
      }
    } catch (error) {
      this.log(`Error cleaning old backups: ${error}`);
    }
  }

  private sendProgress(progress: ProgressInfo): void {
    this.mainWindow?.webContents.send('backup-progress', progress);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    
    // Write to log file
    const logFile = path.join(this.logPath, 'app.log');
    fs.appendFileSync(logFile, logMessage + '\n');
    
    // Send to renderer
    this.mainWindow?.webContents.send('log-message', logMessage);
  }

  private setupIPC(): void {
    // Window controls
    ipcMain.handle('minimize-window', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('maximize-window', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.restore();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('close-window', () => {
      this.mainWindow?.close();
    });

    // Configuration
    ipcMain.handle('get-config', () => {
      return this.config;
    });

    ipcMain.handle('save-config', async (event, newConfig: AppConfig) => {
      try {
        this.saveConfig(newConfig);
        this.setupScheduler(); // Restart scheduler with new config
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    // Directory selection
    ipcMain.handle('select-directory', async (event, defaultPath?: string) => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openDirectory'],
        defaultPath: defaultPath || os.homedir()
      });
      
      return result.canceled ? null : result.filePaths[0];
    });

    // Backup operations
    ipcMain.handle('start-backup', async () => {
      try {
        await this.performBackup('manual');
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('get-backups', async () => {
      try {
        const backupFiles = await fs.readdir(this.config.backupPath);
        const backups: BackupInfo[] = [];
        
        for (const file of backupFiles) {
          if (file.startsWith('WoW_Backup_') && file.endsWith('.zip')) {
            const filePath = path.join(this.config.backupPath, file);
            const stat = await fs.stat(filePath);
            
            backups.push({
              name: file,
              path: filePath,
              size: stat.size,
              date: stat.mtime,
              type: 'manual' // We could enhance this to detect scheduled vs manual
            });
          }
        }
        
        return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
      } catch (error) {
        this.log(`Error getting backups: ${error}`);
        return [];
      }
    });

    ipcMain.handle('delete-backup', async (event, backupPath: string) => {
      try {
        await fs.remove(backupPath);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('open-backup-folder', () => {
      shell.openPath(this.config.backupPath);
    });

    // Auto-detect WoW path
    ipcMain.handle('detect-wow-path', () => {
      return this.findWowPath();
    });
  }
}

// Create app instance
new WowBackupApp();
