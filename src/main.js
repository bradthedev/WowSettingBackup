const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { spawn, exec } = require('child_process');
const archiver = require('archiver');
const extractZip = require('extract-zip');
const { CronJob } = require('cron');

class WowBackupApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.schedulerJob = null;
        this.isQuiting = false;
        this.config = this.loadConfig();
        
        // Paths
        this.appDir = app.getAppPath();
        this.configPath = path.join(app.getPath('userData'), 'config.json');
        this.logPath = path.join(app.getPath('userData'), 'logs');
        
        // Ensure log directory exists
        fs.ensureDirSync(this.logPath);
        
        this.setupApp();
    }

    setupApp() {
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
            if (this.schedulerJob) {
                this.schedulerJob.destroy();
            }
        });

        this.setupIpcHandlers();
    }

    createWindow() {
        // Create the browser window
        this.mainWindow = new BrowserWindow({
            width: 900,
            height: 700,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            },
            icon: this.getAppIcon(),
            show: false,
            titleBarStyle: 'hidden',
            titleBarOverlay: {
                color: '#2c3e50',
                symbolColor: '#ffffff'
            }
        });

        // Load the app
        this.mainWindow.loadFile('public/index.html');

        // Show window when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
        });

        // Handle window close - minimize to tray instead
        this.mainWindow.on('close', (event) => {
            if (!this.isQuiting) {
                event.preventDefault();
                this.mainWindow.hide();
                if (process.platform === 'darwin') {
                    app.dock.hide();
                }
            }
        });
    }

    createTray() {
        const icon = this.getAppIcon();
        this.tray = new Tray(icon);
        
        const contextMenu = Menu.buildFromTemplate([
            { 
                label: 'Show WoW Backup Manager', 
                click: () => this.showWindow() 
            },
            { type: 'separator' },
            { 
                label: 'Run Backup Now', 
                click: () => this.performBackup() 
            },
            { 
                label: 'Open Backup Folder', 
                click: () => this.openBackupFolder() 
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
        
        // Double click to show window
        this.tray.on('double-click', () => {
            this.showWindow();
        });
    }

    showWindow() {
        if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
            if (process.platform === 'darwin') {
                app.dock.show();
            }
        }
    }

    getAppIcon() {
        // Create a simple icon if none exists
        const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
        if (fs.existsSync(iconPath)) {
            return nativeImage.createFromPath(iconPath);
        }
        
        // Create a simple programmatic icon
        const canvas = require('canvas') || null;
        if (canvas) {
            const { createCanvas } = canvas;
            const canvasEl = createCanvas(64, 64);
            const ctx = canvasEl.getContext('2d');
            
            // Draw a simple backup icon
            ctx.fillStyle = '#3498db';
            ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = '#ffffff';
            ctx.font = '32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('W', 32, 42);
            
            return nativeImage.createFromBuffer(canvasEl.toBuffer());
        }
        
        return nativeImage.createEmpty();
    }

    setupIpcHandlers() {
        // Get config
        ipcMain.handle('get-config', () => {
            return this.config;
        });

        // Save config
        ipcMain.handle('save-config', (event, newConfig) => {
            this.config = { ...this.config, ...newConfig };
            this.saveConfig();
            this.updateScheduler();
            return this.config;
        });

        // Select directory
        ipcMain.handle('select-directory', async (event, title = 'Select Directory') => {
            const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ['openDirectory'],
                title: title
            });
            return result.canceled ? null : result.filePaths[0];
        });

        // Select backup file
        ipcMain.handle('select-backup-file', async () => {
            const result = await dialog.showOpenDialog(this.mainWindow, {
                properties: ['openFile'],
                filters: [
                    { name: 'Zip Files', extensions: ['zip'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                title: 'Select Backup Archive'
            });
            return result.canceled ? null : result.filePaths[0];
        });

        // Perform backup
        ipcMain.handle('perform-backup', async (event) => {
            return await this.performBackup();
        });

        // Perform restore
        ipcMain.handle('perform-restore', async (event, backupFile) => {
            return await this.performRestore(backupFile);
        });

        // Open backup folder
        ipcMain.handle('open-backup-folder', () => {
            this.openBackupFolder();
        });

        // Get app version
        ipcMain.handle('get-app-version', () => {
            return app.getVersion();
        });

        // Minimize to tray
        ipcMain.handle('minimize-to-tray', () => {
            this.mainWindow.hide();
        });
    }

    loadConfig() {
        const defaultConfig = {
            wowVersion: '_retail_',
            wowBaseDir: 'C:\\Program Files (x86)\\World of Warcraft',
            tempBaseDir: path.join(os.tmpdir(), 'WowBackup'),
            destDir: path.join(os.homedir(), 'Documents', 'WoWBackups'),
            verbose: false,
            fastCompression: true,
            enableScheduler: false,
            scheduleInterval: 24,
            scheduleUnit: 'hours'
        };

        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readJsonSync(this.configPath);
                return { ...defaultConfig, ...configData };
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }

        return defaultConfig;
    }

    saveConfig() {
        try {
            fs.ensureDirSync(path.dirname(this.configPath));
            fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    async performBackup() {
        try {
            this.sendToRenderer('backup-progress', { progress: 0, status: 'Initializing backup...' });
            this.log('🚀 Starting backup operation...');

            // Validate paths
            if (!await this.validateBackupPaths()) {
                throw new Error('Backup validation failed');
            }

            // Setup directories
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const tempDir = path.join(this.config.tempBaseDir, timestamp);
            
            // Create temp directory
            await fs.ensureDir(tempDir);
            this.sendToRenderer('backup-progress', { progress: 5, status: 'Created temporary directory' });

            // Copy WoW directories
            await this.copyWowDirectories(tempDir);

            // Compress backup
            const archivePath = await this.compressBackup(tempDir);

            // Finalize backup
            await this.finalizeBackup(tempDir, timestamp, archivePath);

            this.sendToRenderer('backup-progress', { progress: 100, status: 'Backup completed successfully!' });
            this.log('✅ Backup operation completed successfully');
            
            return { success: true, message: 'Backup completed successfully!' };

        } catch (error) {
            this.log(`❌ Backup failed: ${error.message}`);
            this.sendToRenderer('backup-progress', { progress: 0, status: 'Backup failed' });
            return { success: false, error: error.message };
        }
    }

    async validateBackupPaths() {
        const wowBase = this.config.wowBaseDir;
        const wowVersion = this.config.wowVersion;
        
        const interfaceDir = path.join(wowBase, wowVersion, 'Interface');
        const wtfDir = path.join(wowBase, wowVersion, 'WTF');
        
        if (!await fs.pathExists(interfaceDir)) {
            this.log(`❌ Interface directory not found: ${interfaceDir}`);
            return false;
        }
        
        if (!await fs.pathExists(wtfDir)) {
            this.log(`❌ WTF directory not found: ${wtfDir}`);
            return false;
        }
        
        await fs.ensureDir(this.config.tempBaseDir);
        return true;
    }

    async copyWowDirectories(tempDir) {
        const wowBase = this.config.wowBaseDir;
        const wowVersion = this.config.wowVersion;
        
        const interfaceDir = path.join(wowBase, wowVersion, 'Interface');
        const wtfDir = path.join(wowBase, wowVersion, 'WTF');
        
        // Copy Interface
        this.sendToRenderer('backup-progress', { progress: 10, status: 'Copying Interface directory...' });
        await fs.copy(interfaceDir, path.join(tempDir, 'Interface'));
        this.sendToRenderer('backup-progress', { progress: 35, status: 'Interface copied' });
        
        // Copy WTF
        this.sendToRenderer('backup-progress', { progress: 40, status: 'Copying WTF directory...' });
        await fs.copy(wtfDir, path.join(tempDir, 'WTF'));
        this.sendToRenderer('backup-progress', { progress: 65, status: 'WTF copied' });
    }

    async compressBackup(tempDir) {
        return new Promise((resolve, reject) => {
            const archivePath = `${tempDir}.zip`;
            const output = fs.createWriteStream(archivePath);
            const archive = archiver('zip', {
                zlib: { level: this.config.fastCompression ? 1 : 9 }
            });

            this.sendToRenderer('backup-progress', { progress: 70, status: 'Compressing backup...' });

            output.on('close', () => {
                this.log(`🗜️ Archive created: ${archivePath} (${archive.pointer()} bytes)`);
                resolve(archivePath);
            });

            archive.on('error', (err) => {
                reject(err);
            });

            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize();
        });
    }

    async finalizeBackup(tempDir, timestamp, archivePath) {
        this.sendToRenderer('backup-progress', { progress: 90, status: 'Finalizing backup...' });
        
        const destPath = path.join(this.config.destDir, `${timestamp}.zip`);
        
        // Ensure destination directory exists
        await fs.ensureDir(this.config.destDir);
        
        // Move archive to destination
        await fs.move(archivePath, destPath);
        
        // Remove temp directory
        await fs.remove(tempDir);
        
        // Perform backup rotation
        await this.rotateBackups();
        
        // Log final size
        const stats = await fs.stat(destPath);
        this.log(`📦 Backup saved: ${destPath} (${stats.size.toLocaleString()} bytes)`);
    }

    async rotateBackups() {
        try {
            const destDir = this.config.destDir;
            if (!await fs.pathExists(destDir)) return;

            const files = await fs.readdir(destDir);
            const backups = [];
            
            for (const file of files) {
                if (file.endsWith('.zip')) {
                    try {
                        const filePath = path.join(destDir, file);
                        const stats = await fs.stat(filePath);
                        backups.push({ file, date: stats.mtime });
                    } catch (error) {
                        // Skip invalid files
                    }
                }
            }

            if (backups.length === 0) return;

            // Sort by date (newest first)
            backups.sort((a, b) => b.date - a.date);

            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

            // Keep recent backups (last 30 days)
            const recentBackups = backups.filter(b => b.date >= thirtyDaysAgo);
            const oldBackups = backups.filter(b => b.date < thirtyDaysAgo);

            // For old backups, keep only the latest from each month
            const monthlyKeepers = new Map();
            for (const backup of oldBackups) {
                const monthKey = `${backup.date.getFullYear()}-${backup.date.getMonth()}`;
                if (!monthlyKeepers.has(monthKey) || backup.date > monthlyKeepers.get(monthKey).date) {
                    monthlyKeepers.set(monthKey, backup);
                }
            }

            // Combine backups to keep
            const backupsToKeep = new Set([
                ...recentBackups.map(b => b.file),
                ...Array.from(monthlyKeepers.values()).map(b => b.file)
            ]);

            // Remove backups not in the keep list
            let removedCount = 0;
            for (const backup of backups) {
                if (!backupsToKeep.has(backup.file)) {
                    await fs.remove(path.join(destDir, backup.file));
                    this.log(`🗑️ Removed old backup: ${backup.file}`);
                    removedCount++;
                }
            }

            if (removedCount > 0) {
                this.log(`📦 Backup rotation complete: removed ${removedCount} old backups`);
            }

        } catch (error) {
            this.log(`Warning: Backup rotation failed: ${error.message}`);
        }
    }

    async performRestore(backupFile) {
        try {
            this.sendToRenderer('restore-progress', { progress: 0, status: 'Initializing restore...' });
            this.log(`🔄 Starting restore from: ${path.basename(backupFile)}`);

            // Validate backup file exists
            if (!await fs.pathExists(backupFile)) {
                throw new Error('Backup file not found');
            }

            // Create temp directory for extraction
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const tempDir = path.join(this.config.tempBaseDir, `restore_${timestamp}`);

            this.sendToRenderer('restore-progress', { progress: 20, status: 'Extracting backup...' });

            // Extract backup
            await extractZip(backupFile, { dir: tempDir });

            // Verify required directories exist
            const tempInterface = path.join(tempDir, 'Interface');
            const tempWTF = path.join(tempDir, 'WTF');

            if (!await fs.pathExists(tempInterface) || !await fs.pathExists(tempWTF)) {
                throw new Error('Invalid backup - missing Interface or WTF directories');
            }

            this.log('✅ Backup extraction completed successfully');

            // Setup target paths
            const wowBase = this.config.wowBaseDir;
            const wowVersion = this.config.wowVersion;
            const interfaceDir = path.join(wowBase, wowVersion, 'Interface');
            const wtfDir = path.join(wowBase, wowVersion, 'WTF');

            // Restore Interface directory
            this.sendToRenderer('restore-progress', { progress: 75, status: 'Restoring Interface directory...' });
            await this.restoreDirectory(tempInterface, interfaceDir, 'Interface');

            // Restore WTF directory
            this.sendToRenderer('restore-progress', { progress: 85, status: 'Restoring WTF directory...' });
            await this.restoreDirectory(tempWTF, wtfDir, 'WTF');

            // Cleanup
            this.sendToRenderer('restore-progress', { progress: 95, status: 'Cleaning up...' });
            await fs.remove(tempDir);
            this.log('🧹 Temporary files cleaned up');

            this.sendToRenderer('restore-progress', { progress: 100, status: 'Restore completed successfully!' });
            this.log('🎉 Restore completed successfully!');

            return { success: true, message: 'Restore completed successfully!' };

        } catch (error) {
            this.log(`❌ Restore failed: ${error.message}`);
            this.sendToRenderer('restore-progress', { progress: 0, status: 'Restore failed' });
            return { success: false, error: error.message };
        }
    }

    async restoreDirectory(sourceDir, destDir, dirName) {
        try {
            // Remove existing directory if it exists
            if (await fs.pathExists(destDir)) {
                this.log(`🗑️ Removing existing ${dirName} directory...`);
                await fs.remove(destDir);
            }

            // Copy directory
            await fs.copy(sourceDir, destDir);
            this.log(`✅ ${dirName} directory restored successfully`);

        } catch (error) {
            this.log(`❌ Error restoring ${dirName}: ${error.message}`);
            throw error;
        }
    }

    setupScheduler() {
        this.updateScheduler();
    }

    updateScheduler() {
        // Destroy existing job
        if (this.schedulerJob) {
            this.schedulerJob.destroy();
            this.schedulerJob = null;
        }

        if (!this.config.enableScheduler) {
            this.log('📅 Scheduler disabled');
            return;
        }

        try {
            let cronPattern;
            const interval = this.config.scheduleInterval;

            switch (this.config.scheduleUnit) {
                case 'minutes':
                    cronPattern = `*/${interval} * * * *`;
                    break;
                case 'hours':
                    cronPattern = `0 */${interval} * * *`;
                    break;
                case 'days':
                    cronPattern = `0 0 */${interval} * *`;
                    break;
                default:
                    cronPattern = '0 */24 * * *'; // Default to daily
            }

            this.schedulerJob = new CronJob(cronPattern, () => {
                this.log('⏰ Scheduled backup starting...');
                this.performBackup();
            }, null, true);

            this.log(`📅 Scheduler enabled: every ${interval} ${this.config.scheduleUnit}`);

        } catch (error) {
            this.log(`❌ Scheduler setup failed: ${error.message}`);
        }
    }

    openBackupFolder() {
        if (fs.existsSync(this.config.destDir)) {
            shell.openPath(this.config.destDir);
        } else {
            this.log('❌ Backup folder does not exist');
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} - ${message}`;
        
        // Log to file
        const logFile = path.join(this.logPath, `backup_${new Date().toISOString().slice(0, 10)}.log`);
        fs.appendFileSync(logFile, logMessage + '\\n');
        
        // Send to renderer
        this.sendToRenderer('log-message', logMessage);
        
        console.log(logMessage);
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

// Create app instance
const wowBackupApp = new WowBackupApp();

module.exports = WowBackupApp;
