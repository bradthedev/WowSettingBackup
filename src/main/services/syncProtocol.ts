export const SYNC_SERVICE_TYPE = 'wow-backup-sync';
export const SYNC_SERVICE_TCP = '_wow-backup-sync._tcp';
export const DEFAULT_SYNC_PORT = 9400;
export const CHUNK_SIZE = 256 * 1024; // 256KB
export const WINDOW_SIZE = 4; // chunks in flight

// Binary chunk header: 20 bytes
// [4: chunkIndex][4: totalChunks][8: offset][4: payloadSize]
export const CHUNK_HEADER_SIZE = 20;

export type MessageType =
  | 'hello'
  | 'pair_request'
  | 'pair_response'
  | 'auth'
  | 'auth_response'
  | 'backup_list'
  | 'backup_list_response'
  | 'transfer_start'
  | 'transfer_chunk'
  | 'transfer_complete'
  | 'transfer_ack'
  | 'error'
  | 'ping'
  | 'pong';

export interface SyncMessage {
  type: MessageType;
  payload: Record<string, unknown>;
}

export interface HelloPayload {
  deviceId: string;
  deviceName: string;
  version: string;
}

export interface PairRequestPayload {
  pin: string;
  deviceId: string;
  deviceName: string;
}

export interface PairResponsePayload {
  accepted: boolean;
  pairingToken?: string;
  reason?: string;
}

export interface AuthPayload {
  deviceId: string;
  pairingToken: string;
}

export interface AuthResponsePayload {
  authenticated: boolean;
  reason?: string;
}

export interface BackupListItem {
  id: string;
  name: string;
  size: number;
  date: string;
  wowVersion: string;
}

export interface TransferStartPayload {
  backupId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  checksum: string;
}

export interface TransferAckPayload {
  chunkIndex: number;
}

export interface TransferCompletePayload {
  backupId: string;
  checksum: string;
}

export interface PairedDevice {
  id: string;
  name: string;
  pairingToken: string;
  lastSeen: string;
}

export function encodeMessage(msg: SyncMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage(data: string): SyncMessage {
  return JSON.parse(data) as SyncMessage;
}

export function encodeChunkHeader(
  chunkIndex: number,
  totalChunks: number,
  offset: number,
  payloadSize: number,
): Buffer {
  const buf = Buffer.alloc(CHUNK_HEADER_SIZE);
  buf.writeUInt32BE(chunkIndex, 0);
  buf.writeUInt32BE(totalChunks, 4);
  // Write offset as two 32-bit values for large files
  buf.writeUInt32BE(Math.floor(offset / 0x100000000), 8);
  buf.writeUInt32BE(offset >>> 0, 12);
  buf.writeUInt32BE(payloadSize, 16);
  return buf;
}

export function decodeChunkHeader(buf: Buffer): {
  chunkIndex: number;
  totalChunks: number;
  offset: number;
  payloadSize: number;
} {
  return {
    chunkIndex: buf.readUInt32BE(0),
    totalChunks: buf.readUInt32BE(4),
    offset: buf.readUInt32BE(8) * 0x100000000 + buf.readUInt32BE(12),
    payloadSize: buf.readUInt32BE(16),
  };
}
