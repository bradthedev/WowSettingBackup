/**
 * Remote-sync: periodically checks the SMB share for backups created by other
 * machines. When a newer backup is found the renderer is notified so the user
 * can confirm before a download + restore is performed.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { loadConfig } from './config';
import { listRemote, downloadBackup } from './remote';
import { restoreFromZip } from './restore';
import { mountStatus, mountShare } from './smb';
import type { SyncAvailableInfo, WowFlavor } from '../shared/types';

// ---------------------------------------------------------------------------
// Sync state — persisted so we don't re-notify about the same backup
// ---------------------------------------------------------------------------

const STATE_FILE = 'sync-state.json';

/** Map of flavor -> ISO timestamp of the last remote backup we applied/dismissed. */
type SyncState = Partial<Record<WowFlavor, string>>;

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function loadSyncState(): SyncState {
  try {
    const p = statePath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as SyncState;
    }
  } catch {
    // Ignore parse errors; start fresh.
  }
  return {};
}

function saveSyncState(state: SyncState): void {
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Check — returns items the renderer should prompt about
// ---------------------------------------------------------------------------

/**
 * Checks the remote share for backups from other machines that are newer than
 * the last synced timestamp for each enabled flavor.
 *
 * Returns an empty array when:
 * - `autoSyncFromRemote` is disabled in config
 * - The share is not configured or cannot be mounted
 * - No newer foreign backups exist
 */
export async function checkRemoteSync(): Promise<SyncAvailableInfo[]> {
  const cfg = loadConfig();
  if (!cfg.autoSyncFromRemote) return [];
  if (!cfg.smb.host || !cfg.smb.share) return [];

  // Ensure the share is mounted.
  const status = await mountStatus();
  if (!status.mounted) {
    if (!cfg.smb.autoMountOnLaunch) return []; // Don't force-mount if user hasn't opted in.
    const mounted = await mountShare();
    if (!mounted.mounted) return [];
  }

  let remoteFiles;
  try {
    remoteFiles = await listRemote();
  } catch {
    return [];
  }

  const currentHostname = os.hostname();
  const state = loadSyncState();
  const available: SyncAvailableInfo[] = [];

  for (const flavor of cfg.enabledFlavors) {
    // Only consider backups from other machines for this flavor.
    const candidates = remoteFiles.filter(
      (f) =>
        f.flavor === flavor &&
        f.meta?.source?.hostname !== undefined &&
        f.meta.source.hostname !== currentHostname
    );

    if (candidates.length === 0) continue;

    // Find the most recent one.
    candidates.sort(
      (a, b) =>
        new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime()
    );
    const newest = candidates[0];

    // Skip if we've already synced this timestamp (or something newer).
    const lastSynced = state[flavor];
    if (
      lastSynced &&
      new Date(newest.createdAtIso).getTime() <= new Date(lastSynced).getTime()
    ) {
      continue;
    }

    available.push({
      remoteName: newest.name,
      flavor: newest.flavor,
      createdAtIso: newest.createdAtIso,
      sourceHostname: newest.meta?.source?.hostname ?? 'unknown',
      sizeBytes: newest.sizeBytes
    });
  }

  return available;
}

// ---------------------------------------------------------------------------
// Apply — download + restore, then record in state
// ---------------------------------------------------------------------------

/**
 * Downloads the specified remote backup and restores it into the WoW install.
 * Updates the sync state so the same backup isn't offered again.
 */
export async function applySyncBackup(info: SyncAvailableInfo): Promise<void> {
  const localPath = await downloadBackup(info.remoteName);
  await restoreFromZip(localPath);

  if (info.flavor !== 'unknown') {
    const state = loadSyncState();
    state[info.flavor as WowFlavor] = info.createdAtIso;
    saveSyncState(state);
  }
}

// ---------------------------------------------------------------------------
// Dismiss — record without restoring so the banner doesn't reappear
// ---------------------------------------------------------------------------

/**
 * Records the backup's timestamp as "seen" without downloading or restoring,
 * so the user won't be prompted about it again.
 */
export function dismissSyncBackup(info: SyncAvailableInfo): void {
  if (info.flavor !== 'unknown') {
    const state = loadSyncState();
    // Only advance the cursor if this is genuinely newer.
    const current = state[info.flavor as WowFlavor];
    if (
      !current ||
      new Date(info.createdAtIso).getTime() > new Date(current).getTime()
    ) {
      state[info.flavor as WowFlavor] = info.createdAtIso;
      saveSyncState(state);
    }
  }
}

/**
 * Convenience helper: the silent auto-install path. Checks for newer backups
 * and, if any are found AND `autoInstallSyncBackup` is enabled, applies them
 * automatically. Returns the number of backups applied.
 */
export async function autoInstallIfEnabled(): Promise<number> {
  const cfg = loadConfig();
  if (!cfg.autoInstallSyncBackup) return 0;
  const items = await checkRemoteSync();
  let applied = 0;
  for (const item of items) {
    try {
      await applySyncBackup(item);
      applied += 1;
    } catch (err) {
      console.error('[sync] auto-install failed for', item.remoteName, err);
    }
  }
  return applied;
}
