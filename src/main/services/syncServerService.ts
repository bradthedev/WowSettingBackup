import { WebSocketServer, WebSocket } from 'ws';
import { createReadStream, statSync } from 'fs';
import { createHash, randomUUID, randomInt } from 'crypto';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import {
  encodeMessage,
  decodeMessage,
  encodeChunkHeader,
  CHUNK_SIZE,
  WINDOW_SIZE,
} from './syncProtocol';
import type {
  SyncMessage,
  PairedDevice,
  BackupListItem,
  TransferStartPayload,
} from './syncProtocol';
import { BackupHistoryService } from './backupHistoryService';
import { ConfigService } from './configService';
import { LoggerService } from './loggerService';

interface PairedDeviceStore {
  devices: PairedDevice[];
}

interface ConnectedClient {
  ws: WebSocket;
  deviceId: string | null;
  deviceName: string | null;
  authenticated: boolean;
}

export class SyncServerService extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private currentPin: string | null = null;
  private pairedDevices: Store<PairedDeviceStore>;

  constructor(
    private config: ConfigService,
    private backupHistory: BackupHistoryService,
    private logger: LoggerService,
  ) {
    super();
    this.pairedDevices = new Store<PairedDeviceStore>({
      name: 'wow-sync-paired-devices',
      defaults: { devices: [] },
    });
  }

  async start(port?: number): Promise<number> {
    const syncPort = port ?? this.config.get('syncPort');

    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: syncPort });

      this.wss.on('listening', () => {
        this.logger.info('Sync server started', { port: syncPort });
        resolve(syncPort);
      });

      this.wss.on('error', (err) => {
        this.logger.error('Sync server error', { error: err.message });
        reject(err);
      });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  stop(): void {
    if (this.wss) {
      for (const client of this.clients.keys()) {
        client.close();
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      this.currentPin = null;
      this.logger.info('Sync server stopped');
    }
  }

  generatePin(): string {
    this.currentPin = String(randomInt(100000, 999999));
    this.logger.info('PIN generated');
    return this.currentPin;
  }

  getPairedDevices(): PairedDevice[] {
    return this.pairedDevices.get('devices');
  }

  revokeDevice(deviceId: string): void {
    const devices = this.getPairedDevices().filter((d) => d.id !== deviceId);
    this.pairedDevices.set('devices', devices);
    this.logger.info('Device revoked', { deviceId });
  }

  private handleConnection(ws: WebSocket): void {
    const client: ConnectedClient = {
      ws,
      deviceId: null,
      deviceName: null,
      authenticated: false,
    };
    this.clients.set(ws, client);
    this.logger.info('Client connected');

    ws.on('message', (data) => {
      try {
        const msg = decodeMessage(data.toString());
        this.handleMessage(ws, client, msg);
      } catch (err) {
        this.logger.error('Failed to parse message', { error: (err as Error).message });
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this.logger.info('Client disconnected', { deviceId: client.deviceId });
      this.emit('clientDisconnected', client.deviceId);
    });

    ws.on('error', (err) => {
      this.logger.error('Client socket error', { error: err.message });
    });
  }

  private handleMessage(ws: WebSocket, client: ConnectedClient, msg: SyncMessage): void {
    switch (msg.type) {
      case 'hello':
        client.deviceId = msg.payload.deviceId as string;
        client.deviceName = msg.payload.deviceName as string;
        this.send(ws, {
          type: 'hello',
          payload: {
            deviceId: this.config.get('deviceId'),
            deviceName: this.config.get('deviceName'),
            version: '2.0.0',
          },
        });
        break;

      case 'pair_request':
        this.handlePairRequest(ws, client, msg);
        break;

      case 'auth':
        this.handleAuth(ws, client, msg);
        break;

      case 'backup_list':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: { message: 'Not authenticated' } });
          return;
        }
        this.handleBackupList(ws);
        break;

      case 'transfer_start':
        if (!client.authenticated) {
          this.send(ws, { type: 'error', payload: { message: 'Not authenticated' } });
          return;
        }
        this.handleTransferStart(ws, msg);
        break;

      case 'transfer_ack':
        // Acknowledgment for flow control — handled within transfer loop
        break;

      case 'ping':
        this.send(ws, { type: 'pong', payload: {} });
        break;
    }
  }

  private handlePairRequest(ws: WebSocket, client: ConnectedClient, msg: SyncMessage): void {
    const pin = msg.payload.pin as string;
    const deviceId = msg.payload.deviceId as string;
    const deviceName = msg.payload.deviceName as string;

    if (!this.currentPin || pin !== this.currentPin) {
      this.send(ws, {
        type: 'pair_response',
        payload: { accepted: false, reason: 'Invalid PIN' },
      });
      return;
    }

    // Generate pairing token
    const pairingToken = randomUUID();
    const device: PairedDevice = {
      id: deviceId,
      name: deviceName,
      pairingToken,
      lastSeen: new Date().toISOString(),
    };

    const devices = this.getPairedDevices().filter((d) => d.id !== deviceId);
    devices.push(device);
    this.pairedDevices.set('devices', devices);

    client.deviceId = deviceId;
    client.deviceName = deviceName;
    client.authenticated = true;
    this.currentPin = null; // Invalidate PIN after use

    this.send(ws, {
      type: 'pair_response',
      payload: { accepted: true, pairingToken },
    });

    this.emit('devicePaired', device);
    this.logger.info('Device paired', { deviceId, deviceName });
  }

  private handleAuth(ws: WebSocket, client: ConnectedClient, msg: SyncMessage): void {
    const deviceId = msg.payload.deviceId as string;
    const token = msg.payload.pairingToken as string;

    const paired = this.getPairedDevices().find(
      (d) => d.id === deviceId && d.pairingToken === token,
    );

    if (!paired) {
      this.send(ws, {
        type: 'auth_response',
        payload: { authenticated: false, reason: 'Unknown device or invalid token' },
      });
      return;
    }

    // Update last seen
    const devices = this.getPairedDevices().map((d) =>
      d.id === deviceId ? { ...d, lastSeen: new Date().toISOString() } : d,
    );
    this.pairedDevices.set('devices', devices);

    client.deviceId = deviceId;
    client.deviceName = paired.name;
    client.authenticated = true;

    this.send(ws, {
      type: 'auth_response',
      payload: { authenticated: true },
    });

    this.logger.info('Device authenticated via token', { deviceId });
  }

  private handleBackupList(ws: WebSocket): void {
    const history = this.backupHistory.getAll();
    const wowVersion = this.config.get('wowVersion');

    const list: BackupListItem[] = history
      .filter((b) => b.status === 'success')
      .map((b) => ({
        id: b.id,
        name: b.name,
        size: b.size,
        date: b.date,
        wowVersion: wowVersion.replace(/_/g, ''),
      }));

    this.send(ws, {
      type: 'backup_list_response',
      payload: { backups: list },
    });
  }

  private async handleTransferStart(ws: WebSocket, msg: SyncMessage): Promise<void> {
    const backupId = msg.payload.backupId as string;
    const backup = this.backupHistory.getAll().find((b) => b.id === backupId);

    if (!backup) {
      this.send(ws, { type: 'error', payload: { message: 'Backup not found' } });
      return;
    }

    const fileSize = statSync(backup.path).size;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

    // Calculate checksum
    const checksum = await this.calculateChecksum(backup.path);

    const startPayload: TransferStartPayload = {
      backupId,
      fileName: backup.name + '.tar.lz4',
      fileSize,
      totalChunks,
      checksum,
    };

    this.send(ws, { type: 'transfer_start', payload: startPayload as unknown as Record<string, unknown> });

    // Stream file in chunks with flow control
    await this.streamFile(ws, backup.path, totalChunks);

    this.send(ws, {
      type: 'transfer_complete',
      payload: { backupId, checksum },
    });

    this.logger.info('Transfer complete', { backupId, fileSize, totalChunks });
  }

  private async streamFile(ws: WebSocket, filePath: string, totalChunks: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
      let chunkIndex = 0;

      stream.on('data', (chunk: string | Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const header = encodeChunkHeader(
          chunkIndex,
          totalChunks,
          chunkIndex * CHUNK_SIZE,
          buf.length,
        );
        const frame = Buffer.concat([header, buf]);

        ws.send(frame, { binary: true }, (err) => {
          if (err) {
            stream.destroy();
            reject(err);
          }
        });

        chunkIndex++;

        // Simple flow control: pause if buffer is getting full
        if (ws.bufferedAmount > CHUNK_SIZE * WINDOW_SIZE) {
          stream.pause();
          const check = (): void => {
            if (ws.bufferedAmount < CHUNK_SIZE * 2) {
              stream.resume();
            } else {
              setTimeout(check, 10);
            }
          };
          setTimeout(check, 10);
        }
      });

      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  private calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private send(ws: WebSocket, msg: SyncMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encodeMessage(msg));
    }
  }
}
