import WebSocket from 'ws';
import { createWriteStream, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import {
  encodeMessage,
  decodeMessage,
  decodeChunkHeader,
  CHUNK_HEADER_SIZE,
} from './syncProtocol';
import type {
  SyncMessage,
  BackupListItem,
  TransferStartPayload,
  TransferCompletePayload,
} from './syncProtocol';
import { ConfigService } from './configService';
import { BackupService } from './backupService';
import { LoggerService } from './loggerService';

export interface KnownHost {
  id: string;
  name: string;
  address: string;
  pairingToken: string;
  lastConnected: string;
}

interface KnownHostsStore {
  hosts: KnownHost[];
}

interface TransferState {
  fileName: string;
  fileSize: number;
  totalChunks: number;
  receivedChunks: number;
  checksum: string;
  outputPath: string;
  hash: ReturnType<typeof createHash>;
  writeStream: ReturnType<typeof createWriteStream>;
}

export class SyncClientService extends EventEmitter {
  private ws: WebSocket | null = null;
  private knownHosts: Store<KnownHostsStore>;
  private currentTransfer: TransferState | null = null;
  private connectedHostId: string | null = null;

  constructor(
    private config: ConfigService,
    private backup: BackupService,
    private logger: LoggerService,
  ) {
    super();
    this.knownHosts = new Store<KnownHostsStore>({
      name: 'wow-sync-known-hosts',
      defaults: { hosts: [] },
    });
  }

  async connect(address: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${address}:${port}`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.logger.info('Connected to host', { address, port });
        this.sendMessage({
          type: 'hello',
          payload: {
            deviceId: this.config.get('deviceId'),
            deviceName: this.config.get('deviceName'),
            version: '2.0.0',
          },
        });
        this.emit('stateChange', 'connected');
        resolve();
      });

      this.ws.on('message', (data, isBinary) => {
        if (isBinary) {
          this.handleBinaryMessage(data as Buffer);
        } else {
          try {
            const msg = decodeMessage(data.toString());
            this.handleMessage(msg);
          } catch (err) {
            this.logger.error('Failed to parse message', { error: (err as Error).message });
          }
        }
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.connectedHostId = null;
        this.emit('stateChange', 'disconnected');
        this.logger.info('Disconnected from host');
      });

      this.ws.on('error', (err) => {
        this.logger.error('Connection error', { error: err.message });
        reject(err);
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentTransfer = null;
  }

  async pairWithPin(pin: string): Promise<void> {
    this.sendMessage({
      type: 'pair_request',
      payload: {
        pin,
        deviceId: this.config.get('deviceId'),
        deviceName: this.config.get('deviceName'),
      },
    });
  }

  async authenticateWithToken(hostId: string): Promise<void> {
    const host = this.getKnownHosts().find((h) => h.id === hostId);
    if (!host) throw new Error('Unknown host');

    this.sendMessage({
      type: 'auth',
      payload: {
        deviceId: this.config.get('deviceId'),
        pairingToken: host.pairingToken,
      },
    });
  }

  requestBackupList(): void {
    this.sendMessage({ type: 'backup_list', payload: {} });
  }

  requestTransfer(backupId: string): void {
    this.sendMessage({
      type: 'transfer_start',
      payload: { backupId },
    });
  }

  cancelTransfer(): void {
    if (this.currentTransfer) {
      this.currentTransfer.writeStream.end();
      this.currentTransfer = null;
      this.emit('transferCancelled');
    }
  }

  getKnownHosts(): KnownHost[] {
    return this.knownHosts.get('hosts');
  }

  forgetHost(hostId: string): void {
    const hosts = this.getKnownHosts().filter((h) => h.id !== hostId);
    this.knownHosts.set('hosts', hosts);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handleMessage(msg: SyncMessage): void {
    switch (msg.type) {
      case 'hello':
        this.connectedHostId = msg.payload.deviceId as string;
        this.emit('hello', msg.payload);
        break;

      case 'pair_response': {
        const accepted = msg.payload.accepted as boolean;
        if (accepted) {
          const token = msg.payload.pairingToken as string;
          this.savePairingToken(this.connectedHostId!, token);
          this.emit('stateChange', 'paired');
          this.logger.info('Pairing accepted');
        } else {
          this.emit('pairRejected', msg.payload.reason);
          this.logger.warn('Pairing rejected', { reason: msg.payload.reason });
        }
        break;
      }

      case 'auth_response': {
        const authenticated = msg.payload.authenticated as boolean;
        if (authenticated) {
          this.emit('stateChange', 'authenticated');
          this.logger.info('Authenticated with host');
        } else {
          this.emit('authFailed', msg.payload.reason);
          this.logger.warn('Authentication failed', { reason: msg.payload.reason });
        }
        break;
      }

      case 'backup_list_response':
        this.emit('backupList', msg.payload.backups as BackupListItem[]);
        break;

      case 'transfer_start':
        this.handleTransferStart(msg.payload as unknown as TransferStartPayload);
        break;

      case 'transfer_complete':
        this.handleTransferComplete(msg.payload as unknown as TransferCompletePayload);
        break;

      case 'error':
        this.emit('error', msg.payload.message);
        this.logger.error('Server error', { message: msg.payload.message });
        break;

      case 'pong':
        break;
    }
  }

  private handleTransferStart(payload: TransferStartPayload): void {
    const backupDir = this.config.get('backupDir');
    mkdirSync(backupDir, { recursive: true });

    const outputPath = path.join(backupDir, payload.fileName);

    this.currentTransfer = {
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      totalChunks: payload.totalChunks,
      receivedChunks: 0,
      checksum: payload.checksum,
      outputPath,
      hash: createHash('sha256'),
      writeStream: createWriteStream(outputPath),
    };

    this.emit('transferStarted', {
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      totalChunks: payload.totalChunks,
    });

    this.logger.info('Transfer started', {
      fileName: payload.fileName,
      fileSize: payload.fileSize,
    });
  }

  private handleBinaryMessage(data: Buffer): void {
    if (!this.currentTransfer) return;

    const header = decodeChunkHeader(data.subarray(0, CHUNK_HEADER_SIZE));
    const payload = data.subarray(CHUNK_HEADER_SIZE);

    this.currentTransfer.writeStream.write(payload);
    this.currentTransfer.hash.update(payload);
    this.currentTransfer.receivedChunks++;

    const progress = (this.currentTransfer.receivedChunks / this.currentTransfer.totalChunks) * 100;
    this.emit('transferProgress', {
      progress,
      receivedChunks: this.currentTransfer.receivedChunks,
      totalChunks: this.currentTransfer.totalChunks,
      bytesReceived: header.offset + payload.length,
      totalBytes: this.currentTransfer.fileSize,
    });

    // Send ack
    this.sendMessage({
      type: 'transfer_ack',
      payload: { chunkIndex: header.chunkIndex },
    });
  }

  private async handleTransferComplete(payload: TransferCompletePayload): Promise<void> {
    if (!this.currentTransfer) return;

    this.currentTransfer.writeStream.end();

    const localChecksum = this.currentTransfer.hash.digest('hex');
    if (localChecksum !== payload.checksum) {
      this.logger.error('Checksum mismatch', { expected: payload.checksum, got: localChecksum });
      this.emit('transferError', 'Checksum mismatch — transfer corrupted');
      this.currentTransfer = null;
      return;
    }

    this.logger.info('Transfer verified, restoring backup', {
      path: this.currentTransfer.outputPath,
    });

    this.emit('stateChange', 'applying');

    try {
      await this.backup.restoreBackup(this.currentTransfer.outputPath);
      this.emit('stateChange', 'complete');
      this.emit('transferComplete');
    } catch (err) {
      this.emit('transferError', (err as Error).message);
    }

    this.currentTransfer = null;
  }

  private savePairingToken(hostId: string, token: string): void {
    const hosts = this.getKnownHosts().filter((h) => h.id !== hostId);
    hosts.push({
      id: hostId,
      name: '',
      address: '',
      pairingToken: token,
      lastConnected: new Date().toISOString(),
    });
    this.knownHosts.set('hosts', hosts);
  }

  private sendMessage(msg: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMessage(msg));
    }
  }
}
