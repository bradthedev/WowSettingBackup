import extractZip from 'extract-zip';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { WowFlavor } from '../shared/types';
import { WOW_FLAVORS } from '../shared/types';
import { loadConfig } from './config';
import { emitProgress, newProgressId } from './progress';

function inferFlavorFromName(name: string): WowFlavor | null {
  const m = name.match(/^wow-addons_(.+?)_\d{4}-\d{2}-\d{2}_/);
  if (!m) return null;
  const f = m[1];
  return (WOW_FLAVORS as string[]).includes(f) ? (f as WowFlavor) : null;
}

async function safeReplace(src: string, dst: string): Promise<void> {
  if (fs.existsSync(dst)) {
    const backup = `${dst}.bak_${Date.now()}`;
    await fs.promises.rename(dst, backup);
  }
  await fs.promises.mkdir(path.dirname(dst), { recursive: true });
  await fs.promises.cp(src, dst, { recursive: true });
}

/**
 * Extracts a backup zip into the appropriate WoW flavor folder.
 *
 * Backup layout (produced by runBackup):
 *   <flavor>/AddOns/...
 *   <flavor>/WTF/...       (optional)
 *
 * We extract to a temp folder, then move AddOns -> <installRoot>/<flavor>/Interface/AddOns
 * and WTF -> <installRoot>/<flavor>/WTF (replacing existing, stashing old as .bak_<ts>).
 */
export async function restoreFromZip(absZipPath: string): Promise<void> {
  const cfg = loadConfig();
  if (!fs.existsSync(absZipPath)) {
    throw new Error(`Zip not found: ${absZipPath}`);
  }
  const flavor = inferFlavorFromName(path.basename(absZipPath));
  if (!flavor) {
    throw new Error(
      `Could not infer WoW flavor from file name: ${path.basename(absZipPath)}`
    );
  }
  const flavorRoot = path.join(cfg.wowInstallRoot, flavor);
  if (!fs.existsSync(flavorRoot)) {
    throw new Error(
      `WoW flavor folder not found: ${flavorRoot}. Set the correct Install Root in Settings.`
    );
  }

  const id = newProgressId();
  const label = `Restoring ${path.basename(absZipPath)}`;
  emitProgress({ id, phase: 'start', label });

  const tmp = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'wowrestore-')
  );
  try {
    await extractZip(absZipPath, {
      dir: tmp,
      onEntry: (entry, zipfile) => {
        const total = zipfile.entryCount || 1;
        // entriesRead may be undefined in older versions; fall back.
        const done = (zipfile as unknown as { entriesRead?: number }).entriesRead ?? 0;
        emitProgress({
          id,
          phase: 'progress',
          label,
          ratio: Math.min(1, done / total),
          message: entry.fileName
        });
      }
    });

    // Zip top-level is the staging folder name ("<flavor>" after rename).
    const entries = await fs.promises.readdir(tmp);
    const topLevel = entries.length === 1 ? path.join(tmp, entries[0]) : tmp;

    const srcAddons = path.join(topLevel, 'AddOns');
    const srcWtf = path.join(topLevel, 'WTF');

    if (fs.existsSync(srcAddons)) {
      const dstAddons = path.join(flavorRoot, 'Interface', 'AddOns');
      await safeReplace(srcAddons, dstAddons);
    }
    if (fs.existsSync(srcWtf)) {
      const dstWtf = path.join(flavorRoot, 'WTF');
      await safeReplace(srcWtf, dstWtf);
    }

    emitProgress({ id, phase: 'done', label, ratio: 1 });
  } catch (err) {
    emitProgress({
      id,
      phase: 'error',
      label,
      message: (err as Error).message
    });
    throw err;
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
