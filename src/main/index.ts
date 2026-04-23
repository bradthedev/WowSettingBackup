import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, patchConfig } from './config';
import { listBackupsWithMeta, runBackup } from './backup';
import { mountShare, mountStatus, unmountShare } from './smb';
import { downloadBackup, getRemoteMeta, listRemote, uploadBackup } from './remote';
import { restoreFromZip } from './restore';
import { rebuildIndex } from './metadata';
import { startScheduler, updateScheduler, getSchedulerStatus, runScheduledBackupNow } from './scheduler';
import { checkRemoteSync, applySyncBackup, dismissSyncBackup } from './sync';
import { setupTray } from './tray';
import type { AppConfig, SyncAvailableInfo, ThemePreference, WowFlavor } from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

/** Resolve a theme preference ('system' follows OS) to either 'dark' or 'light'. */
function resolveTheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }
  return pref;
}

/** Apply the resolved theme to the main window's native vibrancy + push to renderer. */
function applyTheme(pref: ThemePreference): void {
  const resolved = resolveTheme(pref);
  nativeTheme.themeSource = pref === 'system' ? 'system' : pref;
  if (mainWindow) {
    if (process.platform === 'darwin') {
      // `sidebar` vibrancy looks clean in both light + dark modes on macOS.
      mainWindow.setVibrancy('sidebar');
    } else if (process.platform === 'win32') {
      try {
        // Windows 11 acrylic / mica — graceful no-op on older Windows.
        (mainWindow as BrowserWindow & {
          setBackgroundMaterial?: (m: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed') => void;
        }).setBackgroundMaterial?.('acrylic');
      } catch {
        /* ignore */
      }
    }
    mainWindow.webContents.send('theme:resolved', resolved);
  }
}

async function createWindow(): Promise<void> {
  const cfg = loadConfig();
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'WoW Settings Backup',
    // Fullbleed glass look: let the content extend under the titlebar on macOS
    // and Windows. The renderer adds a small top inset so controls are reachable.
    titleBarStyle: isMac ? 'hiddenInset' : isWin ? 'hidden' : 'default',
    titleBarOverlay: isWin
      ? { color: '#00000000', symbolColor: '#ffffff', height: 32 }
      : false,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    backgroundColor: '#00000000',
    vibrancy: isMac ? 'sidebar' : undefined,
    backgroundMaterial: isWin ? 'acrylic' : undefined,
    transparent: isMac,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close button hides to tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Re-emit the resolved theme whenever the OS appearance changes so the
  // renderer can swap palettes live when the preference is 'system'.
  nativeTheme.on('updated', () => {
    if (!mainWindow) return;
    const currentPref = loadConfig().theme;
    mainWindow.webContents.send('theme:resolved', resolveTheme(currentPref));
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173/');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, '../renderer/index.html')
    );
  }

  // Apply the saved theme after the page has loaded so the first paint is right.
  mainWindow.webContents.once('did-finish-load', () => {
    applyTheme(cfg.theme);
  });
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:set', (_e, patch: Partial<AppConfig>) => {
    const cfg = patchConfig(patch);
    // Restart/stop the scheduler whenever settings change
    updateScheduler();
    // Restart the sync timer so interval changes take effect immediately
    restartRemoteSyncTimer();
    // Re-apply theme so vibrancy + renderer palette pick up preference changes.
    applyTheme(cfg.theme);
    return cfg;
  });

  ipcMain.handle('dialog:pickDirectory', async (_e, title?: string) => {
    const res = await dialog.showOpenDialog({
      title: title ?? 'Choose a folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('backup:run', async (_e, flavors: WowFlavor[]) => {
    const result = await runBackup(flavors);
    const cfg = loadConfig();
    if (!cfg.smb.autoUploadAfterBackup || result.created.length === 0) {
      return result;
    }

    const status = await mountStatus();
    const mount = status.mounted ? status : await mountShare();
    if (!mount.mounted) {
      return {
        ...result,
        errors: [
          ...result.errors,
          {
            flavor: 'unknown',
            message: `Auto-upload failed: ${mount.message ?? 'remote share is not mounted.'}`
          }
        ]
      };
    }

    for (const backup of result.created) {
      try {
        await uploadBackup(backup.path);
      } catch (err) {
        result.errors.push({
          flavor: backup.flavor,
          message: `Auto-upload failed: ${(err as Error).message}`
        });
      }
    }

    return result;
  });
  ipcMain.handle('backup:listLocal', () => {
    const cfg = loadConfig();
    if (!fs.existsSync(cfg.localBackupDir)) {
      fs.mkdirSync(cfg.localBackupDir, { recursive: true });
    }
    return listBackupsWithMeta(cfg.localBackupDir);
  });
  ipcMain.handle('backup:delete', async (_e, absPath: string) => {
    const cfg = loadConfig();
    const resolved = path.resolve(absPath);
    if (!resolved.startsWith(path.resolve(cfg.localBackupDir))) {
      throw new Error('Refusing to delete file outside backup directory.');
    }
    await fs.promises.unlink(resolved);
    const sidecar = `${resolved}.meta.json`;
    if (fs.existsSync(sidecar)) {
      await fs.promises.unlink(sidecar).catch(() => {});
    }
  });

  ipcMain.handle('smb:mount', () => mountShare());
  ipcMain.handle('smb:unmount', () => unmountShare());
  ipcMain.handle('smb:status', () => mountStatus());

  ipcMain.handle('remote:list', () => listRemote());
  ipcMain.handle('remote:upload', (_e, absPath: string) =>
    uploadBackup(absPath)
  );
  ipcMain.handle('remote:download', (_e, name: string) =>
    downloadBackup(name)
  );
  ipcMain.handle('remote:meta', (_e, name: string) => getRemoteMeta(name));
  ipcMain.handle('remote:rebuildIndex', async () => {
    const status = await mountStatus();
    if (!status.mounted || !status.mountPath) {
      throw new Error('Remote share is not mounted.');
    }
    return rebuildIndex(status.mountPath);
  });

  ipcMain.handle('restore:fromZip', (_e, absPath: string) =>
    restoreFromZip(absPath)
  );

  ipcMain.handle('remote:syncApply', async (_e, info: SyncAvailableInfo) => {
    await applySyncBackup(info);
  });

  ipcMain.handle('remote:syncDismiss', (_e, info: SyncAvailableInfo) => {
    dismissSyncBackup(info);
  });

  ipcMain.handle('scheduler:runNow', async () => {
    await runScheduledBackupNow();
  });

  ipcMain.handle('scheduler:getStatus', () => getSchedulerStatus());

  ipcMain.handle('update:install', () => {
    isQuitting = true;
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('shell:showInFolder', (_e, absPath: string) => {
    shell.showItemInFolder(absPath);
  });
  ipcMain.handle('shell:openPath', (_e, absPath: string) =>
    shell.openPath(absPath)
  );
}

// ---------------------------------------------------------------------------
// Quitting flag — set before app.quit() so the close handler lets it through
// ---------------------------------------------------------------------------

let isQuitting = false;

// ---------------------------------------------------------------------------
// Remote-sync checker (SMB share — newer backups from other machines)
// ---------------------------------------------------------------------------

let syncTimer: NodeJS.Timeout | null = null;

async function runRemoteSyncCheck(): Promise<void> {
  try {
    const cfg = loadConfig();
    if (!cfg.autoSyncFromRemote) return;

    const items = await checkRemoteSync();
    if (items.length === 0) return;

    if (cfg.autoInstallSyncBackup) {
      // Silently download + restore each newer backup. The renderer still
      // gets progress events from the download/restore operations.
      for (const item of items) {
        try {
          await applySyncBackup(item);
          mainWindow?.webContents.send('remote:syncApplied', item);
        } catch (err) {
          console.error('[sync] auto-install failed for', item.remoteName, err);
        }
      }
    } else {
      mainWindow?.webContents.send('remote:syncAvailable', items);
    }
  } catch (err) {
    console.error('Remote sync check error:', err);
  }
}

/**
 * Starts (or restarts) the sync timer using the current config's interval.
 * Called on app ready and whenever config changes.
 */
function restartRemoteSyncTimer(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  const cfg = loadConfig();
  if (!cfg.autoSyncFromRemote) return;
  const minutes = cfg.syncIntervalMinutes || 240;
  const ms = minutes * 60 * 1000;
  syncTimer = setInterval(() => runRemoteSyncCheck(), ms);
}

function setupRemoteSync(): void {
  // First check 10 s after launch, then on the configured interval.
  setTimeout(() => runRemoteSyncCheck(), 10_000);
  restartRemoteSyncTimer();
}

// ---------------------------------------------------------------------------
// Auto-updater (GitHub Releases via electron-updater)
// ---------------------------------------------------------------------------

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', info.version);
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message);
  });

  // Check 5 s after launch so startup is not delayed, then every 4 hours.
  setTimeout(() => autoUpdater.checkForUpdates().catch(console.error), 5_000);
  setInterval(() => autoUpdater.checkForUpdates().catch(console.error), 4 * 60 * 60 * 1_000);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();

  // Set up system tray (must be after window creation)
  if (mainWindow) setupTray(mainWindow);

  const cfg = loadConfig();
  if (cfg.smb.autoMountOnLaunch && cfg.smb.host && cfg.smb.share) {
    mountShare().catch((err) =>
      console.warn('Auto-mount failed:', err)
    );
  }

  // Start the scheduled backup timer if enabled
  startScheduler();

  // Check for updates from GitHub Releases (production only)
  if (!isDev) setupAutoUpdater();

  // Check the remote share for newer backups from other machines
  setupRemoteSync();

  app.on('activate', () => {
    // macOS: clicking the dock icon shows the window
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

// Signal that a real quit was requested (from tray menu or OS).
app.on('before-quit', () => {
  isQuitting = true;
});

// Keep the process alive for the tray — don't auto-quit when windows close.
app.on('window-all-closed', () => {
  // Intentionally empty: the app lives in the system tray.
});
