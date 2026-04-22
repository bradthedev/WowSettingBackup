import fs from 'node:fs';
import path from 'node:path';
import type { BackupFile } from '../shared/types';
import { loadConfig } from './config';
import { listBackupsWithMeta } from './backup';
import { mountStatus } from './smb';
import { emitProgress, newProgressId } from './progress';
import {
  metaPathFor,
  publishMeta,
  readMeta,
  upsertIndexEntry
} from './metadata';

async function ensureRemoteReady(): Promise<string> {
  const status = await mountStatus();
  if (!status.mounted || !status.mountPath) {
    throw new Error(
      status.message ?? 'Remote share is not mounted. Mount it first.'
    );
  }
  return status.mountPath;
}

export async function listRemote(): Promise<BackupFile[]> {
  const mp = await ensureRemoteReady();
  return listBackupsWithMeta(mp);
}

async function copyWithProgress(
  src: string,
  dst: string,
  label: string
): Promise<void> {
  const id = newProgressId();
  emitProgress({ id, phase: 'start', label });
  const stat = await fs.promises.stat(src);
  const total = stat.size || 1;
  let copied = 0;

  await fs.promises.mkdir(path.dirname(dst), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const rs = fs.createReadStream(src);
    const ws = fs.createWriteStream(dst);
    rs.on('data', (chunk) => {
      copied += (chunk as Buffer).length;
      emitProgress({
        id,
        phase: 'progress',
        label,
        ratio: Math.min(1, copied / total),
        message: `${Math.round(copied / 1024 / 1024)} MB`
      });
    });
    rs.on('error', reject);
    ws.on('error', reject);
    ws.on('close', () => resolve());
    rs.pipe(ws);
  });

  emitProgress({ id, phase: 'done', label, ratio: 1 });
}

async function copySmall(src: string, dst: string): Promise<void> {
  await fs.promises.copyFile(src, dst);
}

export async function uploadBackup(absLocalPath: string): Promise<void> {
  const mp = await ensureRemoteReady();
  const cfg = loadConfig();
  if (!fs.existsSync(absLocalPath)) {
    throw new Error(`Local file not found: ${absLocalPath}`);
  }
  const fileName = path.basename(absLocalPath);
  const dst = path.join(mp, fileName);

  let copiedZip = false;
  if (fs.existsSync(dst)) {
    const a = fs.statSync(absLocalPath);
    const b = fs.statSync(dst);
    if (a.size !== b.size) {
      await copyWithProgress(absLocalPath, dst, `Uploading ${fileName}`);
      copiedZip = true;
    }
  } else {
    await copyWithProgress(absLocalPath, dst, `Uploading ${fileName}`);
    copiedZip = true;
  }

  // Always (re)publish metadata + update index, so server-side info
  // stays in sync even if the zip itself was already there.
  try {
    const meta = await publishMeta(absLocalPath, dst, {
      wowInstallRoot: cfg.wowInstallRoot
    });
    await upsertIndexEntry(mp, meta);
  } catch (err) {
    console.warn('Failed to publish metadata:', err);
  }

  if (!copiedZip) {
    // No-op for the zip itself, but UI got a metadata refresh.
  }
}

export async function downloadBackup(remoteName: string): Promise<string> {
  const mp = await ensureRemoteReady();
  const cfg = loadConfig();
  const src = path.join(mp, remoteName);
  if (!fs.existsSync(src)) {
    throw new Error(`Remote file not found: ${remoteName}`);
  }
  const dst = path.join(cfg.localBackupDir, remoteName);
  await fs.promises.mkdir(cfg.localBackupDir, { recursive: true });
  await copyWithProgress(src, dst, `Downloading ${remoteName}`);

  // Also fetch the sidecar so the local listing shows source machine info.
  const remoteMeta = metaPathFor(src);
  if (fs.existsSync(remoteMeta)) {
    try {
      await copySmall(remoteMeta, metaPathFor(dst));
    } catch (err) {
      console.warn('Failed to copy metadata sidecar:', err);
    }
  }

  return dst;
}

export async function getRemoteMeta(remoteName: string) {
  const mp = await ensureRemoteReady();
  return readMeta(path.join(mp, remoteName));
}
