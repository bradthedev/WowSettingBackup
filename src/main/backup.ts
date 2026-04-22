import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import type { BackupFile, WowFlavor } from '../shared/types';
import { WOW_FLAVORS } from '../shared/types';
import { loadConfig } from './config';
import { emitProgress, newProgressId } from './progress';
import { metaPathFor, readMeta, writeLocalMeta } from './metadata';

const BACKUP_PREFIX = 'wow-addons';

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function addonsDirFor(installRoot: string, flavor: WowFlavor): string {
  return path.join(installRoot, flavor, 'Interface', 'AddOns');
}

function wtfDirFor(installRoot: string, flavor: WowFlavor): string {
  return path.join(installRoot, flavor, 'WTF');
}

function parseBackupFileName(name: string): {
  flavor: WowFlavor | 'unknown';
  createdAtIso: string;
} {
  const m = name.match(
    /^wow-addons_(.+?)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.zip$/
  );
  if (!m) return { flavor: 'unknown', createdAtIso: new Date(0).toISOString() };
  const flavor = (WOW_FLAVORS as string[]).includes(m[1])
    ? (m[1] as WowFlavor)
    : 'unknown';
  const [, , date, time] = m;
  const iso = `${date}T${time.replace(/-/g, ':')}`;
  return { flavor, createdAtIso: new Date(iso).toISOString() };
}

export function toBackupFile(absPath: string): BackupFile {
  const stat = fs.statSync(absPath);
  const name = path.basename(absPath);
  const parsed = parseBackupFileName(name);
  return {
    path: absPath,
    name,
    flavor: parsed.flavor,
    sizeBytes: stat.size,
    createdAtIso: parsed.createdAtIso === new Date(0).toISOString()
      ? stat.mtime.toISOString()
      : parsed.createdAtIso
  };
}

export function listBackupsIn(dir: string): BackupFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.zip'))
    .map((f) => toBackupFile(path.join(dir, f)))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

export async function listBackupsWithMeta(dir: string): Promise<BackupFile[]> {
  const base = listBackupsIn(dir);
  return Promise.all(
    base.map(async (b) => ({ ...b, meta: await readMeta(b.path) }))
  );
}

/**
 * Remove a directory tree safely on all platforms.
 * Windows fs.rm can fail on deep trees / long paths / antivirus locks,
 * so fall back to a manual recursive delete.
 */
async function rmdirTree(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3 });
    return;
  } catch (_err) {
    // Fall through to manual recursive
  }
  await _rmdirRecursive(dir);
}

async function _rmdirRecursive(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) return;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await _rmdirRecursive(fullPath);
    } else {
      await fs.promises.unlink(fullPath).catch(() => {});
    }
  }
  await fs.promises.rmdir(dir).catch(() => {});
}

async function zipDirectory(
  sourceDir: string,
  outPath: string,
  progressId: string,
  label: string
): Promise<{ entryCount: number }> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  let entryCount = 0;

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    let completed = false;

    function finish(err?: ErrnoException) {
      if (completed) return;
      completed = true;
      // Destroy archiver to release its streams
      archive.finalized() || archive.abort();
      // Destroy the write stream to free the file handle
      if (!output.destroyed) output.destroy();
      if (err) return reject(err);
      return resolve();
    }

    output.on('close', () => finish());
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') finish(err);
    });
    archive.on('error', (err) => finish(err));
    archive.on('progress', (data) => {
      const total = data.entries.total || 1;
      const processed = data.entries.processed || 0;
      entryCount = data.entries.total || entryCount;
      emitProgress({
        id: progressId,
        phase: 'progress',
        label,
        ratio: Math.min(1, processed / total),
        message: `${processed}/${total} entries`
      });
    });

    archive.pipe(output);
    archive.directory(sourceDir, path.basename(sourceDir));
    archive.finalize();
  });
}

function pruneBackups(dir: string, flavor: WowFlavor, keep: number): void {
  const matching = listBackupsIn(dir).filter((b) => b.flavor === flavor);
  const toDelete = matching.slice(keep);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(f.path);
    } catch (err) {
      console.warn('Prune failed for', f.path, err);
    }
    const sidecar = metaPathFor(f.path);
    if (fs.existsSync(sidecar)) {
      try {
        fs.unlinkSync(sidecar);
      } catch {
        // ignore
      }
    }
  }
}

async function copyDirRecursive(src: string, dst: string): Promise<void> {
  await fs.promises.mkdir(dst, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await copyDirRecursive(srcPath, dstPath);
    } else {
      await fs.promises.copyFile(srcPath, dstPath);
    }
  }
}

export async function runBackup(flavors: WowFlavor[]): Promise<BackupFile[]> {
  const cfg = loadConfig();
  const results: BackupFile[] = [];

  for (const flavor of flavors) {
    const addonsDir = addonsDirFor(cfg.wowInstallRoot, flavor);
    const wtfDir = wtfDirFor(cfg.wowInstallRoot, flavor);
    if (!fs.existsSync(addonsDir)) {
      console.warn(`Skipping ${flavor}: no AddOns folder at ${addonsDir}`);
      continue;
    }

    const id = newProgressId();
    const label = 'Backing up ' + flavor;
    emitProgress({ id, phase: 'start', label });

    const stagingRoot = path.join(
      cfg.localBackupDir,
      '.staging_' + flavor + '_' + Date.now()
    );
    const renamedStaging = path.join(cfg.localBackupDir, '.pkg_' + flavor);
    try {
      // Clean previous staging dir if it exists (from a crashed run).
      if (fs.existsSync(stagingRoot)) {
        await rmdirTree(stagingRoot);
      }

      // Stage AddOns + WTF into one folder for the zip.
      await fs.promises.mkdir(stagingRoot, { recursive: true });
      const addonDst = path.join(stagingRoot, 'AddOns');
      // Use readdir + copyFile for better compatibility than fs.cp on some setups.
      await copyDirRecursive(addonsDir, addonDst);

      if (fs.existsSync(wtfDir)) {
        await copyDirRecursive(wtfDir, path.join(stagingRoot, 'WTF'));
      }

      const outName = BACKUP_PREFIX + '_' + flavor + '_' + timestamp() + '.zip';
      const outPath = path.join(cfg.localBackupDir, outName);

      // Rename staging to the name archiver will use as top-level in zip.
      if (fs.existsSync(renamedStaging)) {
        await rmdirTree(renamedStaging);
      }
      await fs.promises.rename(stagingRoot, renamedStaging);

      const { entryCount } = await zipDirectory(renamedStaging, outPath, id, label);

      // Cleanup staging.
      await rmdirTree(renamedStaging);

      // Write sidecar metadata for this backup.
      try {
        await writeLocalMeta(outPath, {
          wowInstallRoot: cfg.wowInstallRoot,
          entryCount
        });
      } catch (metaErr) {
        console.warn('Failed to write metadata sidecar:', metaErr);
      }

      pruneBackups(cfg.localBackupDir, flavor, cfg.retentionCount);

      emitProgress({ id, phase: 'done', label, ratio: 1 });
      results.push(toBackupFile(outPath));
    } catch (err) {
      console.error('Backup failed for ' + flavor + ':', err);
      emitProgress({
        id,
        phase: 'error',
        label,
        message: (err as Error).message
      });
      // cleanup staging
      if (fs.existsSync(stagingRoot)) {
        await rmdirTree(stagingRoot).catch(() => {});
      }
      if (fs.existsSync(renamedStaging)) {
        await rmdirTree(renamedStaging).catch(() => {});
      }
    }
  }

  return results;
}
