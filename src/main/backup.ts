import archiver from 'archiver';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BackupError,
  BackupFile,
  BackupRunResult,
  WowFlavor
} from '../shared/types';
import { WOW_FLAVORS } from '../shared/types';
import { loadConfig } from './config';
import { emitProgress, newProgressId } from './progress';
import { metaPathFor, readMeta, writeLocalMeta } from './metadata';

const BACKUP_PREFIX = 'wow-addons';
const activeBackupTargets = new Set<string>();

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

export function isBackupPathInProgress(absPath: string): boolean {
  return activeBackupTargets.has(path.resolve(absPath));
}

function shouldSkipArchiveEntry(entryName: string): boolean {
  return /(^|\/)(\.git|node_modules)(\/|$)/.test(entryName);
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
  flavor: WowFlavor,
  addonsDir: string,
  wtfDir: string | null,
  outPath: string,
  progressId: string,
  label: string
): Promise<{ entryCount: number; sha256: string }> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  let entryCount = 0;

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    const hash = crypto.createHash('sha256');
    let completed = false;

    function finish(err: unknown = null) {
      if (completed) return;
      completed = true;
      // Destroy the write stream to free the file handle
      if (!output.destroyed) output.destroy();
      if (err) return reject(err);
      return resolve({ entryCount, sha256: hash.digest('hex') });
    }

    output.on('finish', () => finish());
    output.on('close', () => finish());
    output.on('error', (err) => finish(err));
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
    archive.on('data', (chunk) => {
      hash.update(chunk);
    });

    archive.pipe(output);
    archive.directory(addonsDir, `${flavor}/AddOns`, (entry) => {
      if (shouldSkipArchiveEntry(entry.name)) {
        return false;
      }
      return entry;
    });
    if (wtfDir) {
      archive.directory(wtfDir, `${flavor}/WTF`, (entry) => {
        if (shouldSkipArchiveEntry(entry.name)) {
          return false;
        }
        return entry;
      });
    }
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

export async function runBackup(flavors: WowFlavor[]): Promise<BackupRunResult> {
  const cfg = loadConfig();
  const results: BackupFile[] = [];
  const errors: BackupError[] = [];

  if (!fs.existsSync(cfg.wowInstallRoot)) {
    const message = `WoW install root does not exist: ${cfg.wowInstallRoot}`;
    for (const flavor of flavors) {
      const id = newProgressId();
      const label = 'Backing up ' + flavor;
      emitProgress({ id, phase: 'error', label, message });
      errors.push({ flavor, message });
    }
    return { created: results, errors };
  }

  await fs.promises.mkdir(cfg.localBackupDir, { recursive: true });

  for (const flavor of flavors) {
    const addonsDir = addonsDirFor(cfg.wowInstallRoot, flavor);
    const wtfDir = wtfDirFor(cfg.wowInstallRoot, flavor);
    if (!fs.existsSync(addonsDir)) {
      const message = `Missing AddOns folder: ${addonsDir}`;
      const id = newProgressId();
      const label = 'Backing up ' + flavor;
      console.warn(`Skipping ${flavor}: ${message}`);
      emitProgress({ id, phase: 'error', label, message });
      errors.push({ flavor, message });
      continue;
    }

    const id = newProgressId();
    const label = 'Backing up ' + flavor;
    emitProgress({ id, phase: 'start', label });

    const outName = BACKUP_PREFIX + '_' + flavor + '_' + timestamp() + '.zip';
    const outPath = path.join(cfg.localBackupDir, outName);
    const tempOutPath = `${outPath}.partial`;
    activeBackupTargets.add(path.resolve(outPath));
    try {
      // Keep incomplete backups hidden from listings and uploads until the zip is finished.
      if (fs.existsSync(tempOutPath)) {
        await fs.promises.unlink(tempOutPath).catch(() => {});
      }

      const { entryCount, sha256 } = await zipDirectory(
        flavor,
        addonsDir,
        fs.existsSync(wtfDir) ? wtfDir : null,
        tempOutPath,
        id,
        label
      );
      await fs.promises.rename(tempOutPath, outPath);

      // Write sidecar metadata for this backup.
      try {
        await writeLocalMeta(outPath, {
          wowInstallRoot: cfg.wowInstallRoot,
          entryCount,
          sha256
        });
      } catch (metaErr) {
        console.warn('Failed to write metadata sidecar:', metaErr);
      }

      pruneBackups(cfg.localBackupDir, flavor, cfg.retentionCount);

      emitProgress({ id, phase: 'done', label, ratio: 1 });
      results.push(toBackupFile(outPath));
    } catch (err) {
      const message = (err as Error).message;
      console.error('Backup failed for ' + flavor + ':', err);
      emitProgress({
        id,
        phase: 'error',
        label,
        message
      });
      errors.push({ flavor, message });
      if (fs.existsSync(tempOutPath)) {
        await fs.promises.unlink(tempOutPath).catch(() => {});
      }
    } finally {
      activeBackupTargets.delete(path.resolve(outPath));
    }
  }

  return { created: results, errors };
}
