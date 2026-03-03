import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'path';
import { ServiceContainer } from './serviceContainer';

export function registerIpcHandlers(container: ServiceContainer): void {
  const {
    config, logger, backup, backupHistory, scheduler, cloud,
    discovery, syncServer, syncClient,
  } = container;

  // Config handlers
  ipcMain.handle('config:get', () => {
    return config.getAll();
  });

  ipcMain.handle('config:save', (_event, partial: Record<string, unknown>) => {
    config.update(partial);
    logger.info('Config updated', { keys: Object.keys(partial) });
  });

  ipcMain.handle('config:detectWowPath', () => {
    const detected = config.detectWowPath();
    if (detected) {
      logger.info('WoW path detected', { path: detected });
    } else {
      logger.info('WoW path not auto-detected');
    }
    return detected;
  });

  ipcMain.handle('dialog:selectDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Backup handlers
  ipcMain.handle('backup:run', async () => {
    return backup.createBackup('manual');
  });

  ipcMain.handle('backup:restore', async (_event, archivePath: string) => {
    return backup.restoreBackup(archivePath);
  });

  ipcMain.handle('backup:getHistory', () => {
    return backupHistory.getAll();
  });

  ipcMain.handle('backup:deleteHistory', (_event, id: string) => {
    backupHistory.remove(id);
  });

  // Scheduler handlers
  ipcMain.handle('scheduler:start', () => {
    scheduler.start();
  });

  ipcMain.handle('scheduler:stop', () => {
    scheduler.stop();
  });

  ipcMain.handle('scheduler:getStatus', () => {
    return scheduler.getStatus();
  });

  // Cloud handlers
  ipcMain.handle('cloud:authenticate', async (_event, provider: 'google' | 'dropbox') => {
    await cloud.authenticate(provider);
  });

  ipcMain.handle('cloud:disconnect', (_event, provider: 'google' | 'dropbox') => {
    cloud.disconnect(provider);
  });

  ipcMain.handle('cloud:getStatus', (_event, provider: 'google' | 'dropbox') => {
    return cloud.getStatus(provider);
  });

  ipcMain.handle('cloud:upload', async (_event, backupId: string, provider: 'google' | 'dropbox') => {
    const historyItem = backupHistory.getAll().find((b) => b.id === backupId);
    if (!historyItem) throw new Error(`Backup not found: ${backupId}`);

    const win = BrowserWindow.getAllWindows()[0];
    await cloud.upload(historyItem.path, provider, (progress, message) => {
      win?.webContents.send('progress:update', progress, message);
    });
  });

  ipcMain.handle('cloud:download', async (_event, remoteId: string, provider: 'google' | 'dropbox') => {
    const backupDir = config.get('backupDir');
    const localPath = path.join(backupDir, `cloud-download-${Date.now()}.tar.lz4`);

    const win = BrowserWindow.getAllWindows()[0];
    await cloud.download(remoteId, localPath, provider, (progress, message) => {
      win?.webContents.send('progress:update', progress, message);
    });
  });

  ipcMain.handle('cloud:listRemote', async (_event, provider: 'google' | 'dropbox') => {
    return cloud.list(provider);
  });

  // Sync handlers — Host mode
  ipcMain.handle('sync:startHost', async () => {
    const port = await syncServer.start();
    discovery.advertise(port);
    return { port };
  });

  ipcMain.handle('sync:stopHost', () => {
    syncServer.stop();
    discovery.stopAdvertising();
  });

  ipcMain.handle('sync:generatePin', () => {
    const pin = syncServer.generatePin();
    return { pin };
  });

  ipcMain.handle('sync:getPairedDevices', () => {
    return syncServer.getPairedDevices();
  });

  ipcMain.handle('sync:revokeDevice', (_event, id: string) => {
    syncServer.revokeDevice(id);
  });

  // Sync handlers — Slave mode
  ipcMain.handle('sync:browseHosts', () => {
    const win = BrowserWindow.getAllWindows()[0];
    discovery.browse();

    discovery.on('hostFound', (host) => {
      win?.webContents.send('sync:hostFound', host);
    });

    discovery.on('hostLost', (hostId) => {
      win?.webContents.send('sync:hostLost', hostId);
    });
  });

  ipcMain.handle('sync:stopBrowsing', () => {
    discovery.stopBrowsing();
    discovery.removeAllListeners('hostFound');
    discovery.removeAllListeners('hostLost');
  });

  ipcMain.handle('sync:connectToHost', async (_event, address: string) => {
    // Parse address as host:port
    const [host, portStr] = address.split(':');
    const port = parseInt(portStr, 10) || 9400;
    await syncClient.connect(host, port);

    const win = BrowserWindow.getAllWindows()[0];
    syncClient.on('stateChange', (state) => {
      win?.webContents.send('sync:stateChange', state);
    });
    syncClient.on('transferProgress', (data) => {
      win?.webContents.send('sync:progress', data);
    });
  });

  ipcMain.handle('sync:pairWithPin', async (_event, pin: string) => {
    await syncClient.pairWithPin(pin);
  });

  ipcMain.handle('sync:requestBackupList', () => {
    return new Promise((resolve) => {
      syncClient.requestBackupList();
      syncClient.once('backupList', (backups) => {
        resolve(backups);
      });
    });
  });

  ipcMain.handle('sync:startTransfer', (_event, backupId: string) => {
    syncClient.requestTransfer(backupId);
  });

  ipcMain.handle('sync:cancelTransfer', () => {
    syncClient.cancelTransfer();
  });

  ipcMain.handle('sync:getKnownHosts', () => {
    return syncClient.getKnownHosts();
  });

  ipcMain.handle('sync:forgetHost', (_event, id: string) => {
    syncClient.forgetHost(id);
  });

  // Logs handlers
  ipcMain.handle('logs:read', (_event, maxLines?: number) => {
    return logger.readRecentLogs(maxLines);
  });

  ipcMain.handle('logs:getDir', () => {
    return logger.getLogDir();
  });

  logger.info('IPC handlers registered');
}
