import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type {
  BackupMeta,
  MachineInfo,
  RemoteIndex,
  WowFlavor
} from '../shared/types';
import { WOW_FLAVORS } from '../shared/types';

const INDEX_FILE = 'wow-backups-index.json';

export function metaPathFor(zipAbsPath: string): string {
  return `${zipAbsPath}.meta.json`;
}

export function indexPathIn(dir: string): string {
  return path.join(dir, INDEX_FILE);
}

export function getMachineInfo(): MachineInfo {
  const ifaces = os.networkInterfaces();
  const ipv4Addresses: Record<string, string[]> = {};
  let primaryIp: string | undefined;
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    const v4 = addrs
      .filter((a) => a.family === 'IPv4' && !a.internal)
      .map((a) => a.address);
    if (v4.length > 0) {
      ipv4Addresses[name] = v4;
      if (!primaryIp) primaryIp = v4[0];
    }
  }
  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: process.platform,
    arch: process.arch,
    osRelease: `${os.type()} ${os.release()}`,
    primaryIp,
    ipv4Addresses,
    appVersion: app.getVersion()
  };
}

export async function sha256OfFile(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function inferFlavorFromName(name: string): WowFlavor | 'unknown' {
  const m = name.match(/^wow-addons_(.+?)_\d{4}-\d{2}-\d{2}_/);
  if (!m) return 'unknown';
  return (WOW_FLAVORS as string[]).includes(m[1])
    ? (m[1] as WowFlavor)
    : 'unknown';
}

/**
 * Build metadata for a freshly-created backup zip and write a .meta.json
 * sidecar next to it.
 */
export async function writeLocalMeta(
  zipAbsPath: string,
  opts: {
    wowInstallRoot: string;
    entryCount?: number;
    note?: string;
    createdAtIso?: string;
    sha256?: string;
  }
): Promise<BackupMeta> {
  const stat = await fs.promises.stat(zipAbsPath);
  const meta: BackupMeta = {
    schemaVersion: 1,
    file: path.basename(zipAbsPath),
    flavor: inferFlavorFromName(path.basename(zipAbsPath)),
    sizeBytes: stat.size,
    sha256: opts.sha256 ?? await sha256OfFile(zipAbsPath),
    entryCount: opts.entryCount,
    createdAtIso: opts.createdAtIso ?? stat.mtime.toISOString(),
    source: getMachineInfo(),
    wowInstallRoot: opts.wowInstallRoot,
    note: opts.note
  };
  await fs.promises.writeFile(
    metaPathFor(zipAbsPath),
    JSON.stringify(meta, null, 2),
    'utf-8'
  );
  return meta;
}

export async function readMeta(
  zipAbsPath: string
): Promise<BackupMeta | undefined> {
  const p = metaPathFor(zipAbsPath);
  try {
    const raw = await fs.promises.readFile(p, 'utf-8');
    return JSON.parse(raw) as BackupMeta;
  } catch {
    return undefined;
  }
}

/**
 * Copy a local meta sidecar to the remote dir, stamping uploadedAt.
 * If the local sidecar is missing, synthesize one from the zip.
 */
export async function publishMeta(
  localZip: string,
  remoteZip: string,
  opts: { wowInstallRoot: string }
): Promise<BackupMeta> {
  let meta = await readMeta(localZip);
  if (!meta) {
    meta = await writeLocalMeta(localZip, {
      wowInstallRoot: opts.wowInstallRoot
    });
  }
  meta.uploadedAtIso = new Date().toISOString();
  await fs.promises.writeFile(
    metaPathFor(remoteZip),
    JSON.stringify(meta, null, 2),
    'utf-8'
  );
  return meta;
}

export async function readIndex(dir: string): Promise<RemoteIndex> {
  const p = indexPathIn(dir);
  try {
    const raw = await fs.promises.readFile(p, 'utf-8');
    const parsed = JSON.parse(raw) as RemoteIndex;
    if (parsed.schemaVersion === 1 && Array.isArray(parsed.entries)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return { schemaVersion: 1, updatedAtIso: new Date(0).toISOString(), entries: [] };
}

export async function writeIndex(
  dir: string,
  index: RemoteIndex
): Promise<void> {
  index.updatedAtIso = new Date().toISOString();
  await fs.promises.writeFile(
    indexPathIn(dir),
    JSON.stringify(index, null, 2),
    'utf-8'
  );
}

export async function upsertIndexEntry(
  dir: string,
  meta: BackupMeta
): Promise<void> {
  const idx = await readIndex(dir);
  const filtered = idx.entries.filter((e) => e.file !== meta.file);
  filtered.push(meta);
  // Sort newest first.
  filtered.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  idx.entries = filtered;
  await writeIndex(dir, idx);
}

export async function removeIndexEntry(
  dir: string,
  fileName: string
): Promise<void> {
  const idx = await readIndex(dir);
  idx.entries = idx.entries.filter((e) => e.file !== fileName);
  await writeIndex(dir, idx);
}

/**
 * Rebuild an index by scanning a directory for .meta.json files.
 */
export async function rebuildIndex(dir: string): Promise<RemoteIndex> {
  const entries: BackupMeta[] = [];
  const files = await fs.promises.readdir(dir).catch(() => []);
  for (const f of files) {
    if (!f.endsWith('.zip')) continue;
    const meta = await readMeta(path.join(dir, f));
    if (meta) entries.push(meta);
  }
  entries.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  const idx: RemoteIndex = {
    schemaVersion: 1,
    updatedAtIso: new Date().toISOString(),
    entries
  };
  await writeIndex(dir, idx);
  return idx;
}
