import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { MountStatus } from '../shared/types';
import { loadConfig } from './config';

const execP = promisify(exec);

function encodeForUrl(s: string): string {
  return encodeURIComponent(s).replace(/%2F/g, '/');
}

export function resolvedMountPoint(): string | undefined {
  const { smb } = loadConfig();
  return smb.mountPoint && smb.mountPoint.trim().length > 0
    ? smb.mountPoint.trim()
    : undefined;
}

/**
 * Scan `mount` output for an SMB mount of this host+share.
 * macOS `mount` lines look like:
 *   //brad@192.168.0.15/NasBackup/WoWAddonBackup on /Users/brad/mnt/wowbackups (smbfs, ...)
 * Linux CIFS lines look like:
 *   //192.168.0.15/NasBackup/WoWAddonBackup on /mnt/wowbackups type cifs (...)
 */
async function findExistingShareMount(
  host: string,
  share: string
): Promise<string | undefined> {
  try {
    const { stdout } = await execP('mount');
    const needle = `${host}/${share}`.toLowerCase();
    for (const line of stdout.split('\n')) {
      const lower = line.toLowerCase();
      if (!lower.includes(needle)) continue;
      // Extract the path after " on "
      const m = line.match(/ on (.+?) (?:\(|type )/);
      if (m) return m[1];
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function mountStatus(): Promise<MountStatus> {
  const { smb } = loadConfig();
  if (!smb.host || !smb.share) {
    return { mounted: false, message: 'SMB host/share not configured.' };
  }
  const mp = resolvedMountPoint();
  if (!mp) return { mounted: false, message: 'No mount point set.' };

  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // First, accept a mount anywhere for this host+share.
      const existing = await findExistingShareMount(smb.host, smb.share);
      if (existing) return { mounted: true, mountPath: existing };

      const { stdout } = await execP('mount');
      const mounted = stdout
        .split('\n')
        .some((line) => line.includes(` on ${mp} `));
      return mounted
        ? { mounted: true, mountPath: mp }
        : { mounted: false, message: `Not mounted at ${mp}` };
    }
    if (process.platform === 'win32') {
      try {
        await fs.promises.access(mp + path.sep);
        return { mounted: true, mountPath: mp };
      } catch {
        return { mounted: false, message: `Not mounted at ${mp}` };
      }
    }
  } catch (err) {
    return { mounted: false, message: (err as Error).message };
  }
  return { mounted: false, message: 'Unsupported platform' };
}

export async function mountShare(): Promise<MountStatus> {
  const { smb } = loadConfig();
  if (!smb.host || !smb.share) {
    return { mounted: false, message: 'SMB host/share not configured.' };
  }

  const existing = await mountStatus();
  if (existing.mounted) return existing;

  const mp = resolvedMountPoint();
  if (!mp) return { mounted: false, message: 'No mount point set.' };

  try {
    if (process.platform === 'darwin') {
      // /Volumes requires root to create subdirs; if the user picked one
      // there, fall back to ~/mnt/<name> so the mount actually succeeds.
      let target = mp;
      if (mp.startsWith('/Volumes/')) {
        try {
          await fs.promises.mkdir(mp, { recursive: true });
        } catch {
          target = path.join(
            process.env.HOME ?? '/tmp',
            'mnt',
            path.basename(mp)
          );
        }
      }
      await fs.promises.mkdir(target, { recursive: true }).catch(() => {});

      const auth =
        smb.username && smb.password
          ? `${encodeForUrl(smb.username)}:${encodeForUrl(smb.password)}@`
          : smb.username
            ? `${encodeForUrl(smb.username)}@`
            : '';
      const url = `//${auth}${smb.host}/${smb.share}`;
      try {
        await execP(`/sbin/mount_smbfs "${url}" "${target}"`);
      } catch (err) {
        const e = err as { stderr?: string; message: string };
        const detail = (e.stderr || e.message).trim();
        // Share is already mounted somewhere — find and reuse that mount.
        if (/File exists/i.test(detail)) {
          const existing = await findExistingShareMount(smb.host, smb.share);
          if (existing) return { mounted: true, mountPath: existing };
        }
        return { mounted: false, message: detail };
      }
      return { mounted: true, mountPath: target };
    }

    if (process.platform === 'linux') {
      await fs.promises.mkdir(mp, { recursive: true }).catch(() => {});
      const opts: string[] = [];
      if (smb.username) opts.push(`username=${smb.username}`);
      if (smb.password) opts.push(`password=${smb.password}`);
      const optStr = opts.length ? `-o ${opts.join(',')}` : '';
      await execP(
        `mount -t cifs "//${smb.host}/${smb.share}" "${mp}" ${optStr}`.trim()
      );
      return { mounted: true, mountPath: mp };
    }

    if (process.platform === 'win32') {
      const drive = mp.replace(/\\+$/, '');
      const userArg = smb.username ? `/user:${smb.username}` : '';
      const passArg = smb.password ? `"${smb.password}"` : '';
      const cmd =
        `net use ${drive} \\\\${smb.host}\\${smb.share} ${passArg} ${userArg} /persistent:no`.trim();
      await execP(cmd, { windowsHide: true });
      return { mounted: true, mountPath: drive };
    }
  } catch (err) {
    return { mounted: false, message: (err as Error).message };
  }
  return { mounted: false, message: 'Unsupported platform' };
}

export async function unmountShare(): Promise<MountStatus> {
  const mp = resolvedMountPoint();
  if (!mp) return { mounted: false, message: 'No mount point set.' };
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      await execP(`umount "${mp}"`);
      return { mounted: false, message: `Unmounted ${mp}` };
    }
    if (process.platform === 'win32') {
      const drive = mp.replace(/\\+$/, '');
      await execP(`net use ${drive} /delete /y`, { windowsHide: true });
      return { mounted: false, message: `Unmounted ${drive}` };
    }
  } catch (err) {
    return { mounted: false, message: (err as Error).message };
  }
  return { mounted: false, message: 'Unsupported platform' };
}
