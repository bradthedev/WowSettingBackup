import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, patchConfig } from './config';
import { listBackupsWithMeta, runBackup } from './backup';
import { mountShare, mountStatus, unmountShare } from './smb';
import { downloadBackup, getRemoteMeta, listRemote, uploadBackup } from './remote';
import { restoreFromZip } from './restore';
import { rebuildIndex } from './metadata';
import type { AppConfig, WowFlavor } from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: 'WoW Settings Backup',
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

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173/');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, '../renderer/index.html')
    );
  }
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:set', (_e, patch: Partial<AppConfig>) =>
    patchConfig(patch)
  );

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

  ipcMain.handle('shell:showInFolder', (_e, absPath: string) => {
    shell.showItemInFolder(absPath);
  });
  ipcMain.handle('shell:openPath', (_e, absPath: string) =>
    shell.openPath(absPath)
  );
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();

  const cfg = loadConfig();
  if (cfg.smb.autoMountOnLaunch && cfg.smb.host && cfg.smb.share) {
    mountShare().catch((err) =>
      console.warn('Auto-mount failed:', err)
    );
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
