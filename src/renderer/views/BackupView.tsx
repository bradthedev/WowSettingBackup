import React, { useEffect, useState } from 'react';
import type { AppConfig, BackupFile, WowFlavor } from '../../shared/types';
import { WOW_FLAVORS } from '../../shared/types';
import { Empty, formatBytes, formatDate } from '../components/format';
import { MetaDetails } from '../components/MetaDetails';

export function BackupView({
  config,
  onConfigChange
}: {
  config: AppConfig;
  onConfigChange: () => Promise<void>;
}): JSX.Element {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [running, setRunning] = useState(false);
  const [selection, setSelection] = useState<WowFlavor[]>(config.enabledFlavors);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(name: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function refresh(): Promise<void> {
    setBackups(await window.api.listLocalBackups());
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setSelection(config.enabledFlavors);
  }, [config.enabledFlavors]);

  function toggle(f: WowFlavor): void {
    setSelection((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  async function run(): Promise<void> {
    if (selection.length === 0) return;
    setRunning(true);
    let lastError: string | undefined;
    try {
      await window.api.setConfig({ enabledFlavors: selection });
      await onConfigChange();
      const result = await window.api.runBackup(selection);
      await refresh();
      if (result.errors.length > 0) {
        lastError = result.errors
          .map((e) => `${e.flavor}: ${e.message}`)
          .join('\n');
        if (result.created.length > 0) {
          lastError = `Some backups failed:\n\n${lastError}`;
        }
      } else if (result.created.length === 0 && selection.length > 0) {
        lastError = 'No backups were created.';
      }
    } catch (err) {
      lastError = (err as Error).message;
    } finally {
      setRunning(false);
    }
    if (lastError) {
      alert(`Backup failed:\n\n${lastError}`);
      setBackups(await window.api.listLocalBackups());
      console.error('Backup error:', lastError);
    }
  }

  async function del(path: string): Promise<void> {
    await window.api.deleteBackup(path);
    await refresh();
  }

  async function upload(path: string): Promise<void> {
    try {
      await window.api.uploadBackup(path);
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Create backup</h2>
        <p className="muted">
          Install root:{' '}
          <code style={{ color: 'var(--text)' }}>{config.wowInstallRoot}</code>
          &nbsp;· Destination:{' '}
          <code style={{ color: 'var(--text)' }}>{config.localBackupDir}</code>
        </p>

        <div className="field">
          <label>Flavors to back up</label>
          <div className="checkbox-row">
            {WOW_FLAVORS.map((f) => (
              <label key={f}>
                <input
                  type="checkbox"
                  checked={selection.includes(f)}
                  onChange={() => toggle(f)}
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        <div className="row">
          <button
            className="primary"
            onClick={run}
            disabled={running || selection.length === 0}
          >
            {running ? 'Backing up…' : 'Back up now'}
          </button>
          <span className="muted">
            Keeps the last {config.retentionCount} backups per flavor.
            {config.smb.autoUploadAfterBackup
              ? ' New backups will also auto-upload to the remote share.'
              : ''}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Local backups</h2>
          <button
            className="right small"
            onClick={() => window.api.openPath(config.localBackupDir)}
          >
            Open folder
          </button>
          <button className="small" onClick={refresh}>
            Refresh
          </button>
        </div>
        {backups.length === 0 ? (
          <Empty>No local backups yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th />
                <th>File</th>
                <th>Flavor</th>
                <th>Size</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => {
                const open = expanded.has(b.name);
                return (
                  <React.Fragment key={b.path}>
                    <tr>
                      <td>
                        <button
                          className="small"
                          onClick={() => toggleExpanded(b.name)}
                          style={{ minWidth: 28 }}
                          title={open ? 'Hide details' : 'Show details'}
                        >
                          {open ? '−' : '+'}
                        </button>
                      </td>
                      <td style={{ wordBreak: 'break-all' }}>{b.name}</td>
                      <td>{b.flavor}</td>
                      <td>{formatBytes(b.sizeBytes)}</td>
                      <td>{formatDate(b.createdAtIso)}</td>
                      <td className="row" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="small"
                          disabled={running}
                          onClick={() => window.api.showInFolder(b.path)}
                          title="Reveal in Finder/Explorer"
                        >
                          Reveal
                        </button>
                        <button
                          className="small"
                          disabled={running}
                          onClick={() => upload(b.path)}
                          title={running ? 'Wait for the current backup to finish' : undefined}
                        >
                          Upload
                        </button>
                        <button
                          className="small danger"
                          disabled={running}
                          onClick={() => del(b.path)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td />
                        <td colSpan={5}>
                          <MetaDetails meta={b.meta} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
