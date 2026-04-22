import React, { useEffect, useState } from 'react';
import type { BackupFile } from '../../shared/types';
import { Empty, formatBytes, formatDate } from '../components/format';
import { MetaDetails } from '../components/MetaDetails';

export function DownloadView({ mounted }: { mounted: boolean }): JSX.Element {
  const [remote, setRemote] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function refresh(): Promise<void> {
    if (!mounted) {
      setRemote([]);
      return;
    }
    try {
      setRemote(await window.api.listRemoteBackups());
    } catch (err) {
      console.warn(err);
      setRemote([]);
    }
  }

  useEffect(() => {
    refresh();
  }, [mounted]);

  function toggle(name: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function downloadAndRestore(name: string): Promise<void> {
    if (
      !confirm(
        `Download "${name}" and restore it into your WoW install?\n\nYour current AddOns and WTF folders will be backed up with a .bak_<timestamp> suffix before being replaced.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const localPath = await window.api.downloadBackup(name);
      await window.api.restoreFromZip(localPath);
      alert('Restore complete.');
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadOnly(name: string): Promise<void> {
    setBusy(true);
    try {
      const localPath = await window.api.downloadBackup(name);
      alert(`Downloaded to:\n${localPath}`);
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function rebuildIndex(): Promise<void> {
    setBusy(true);
    try {
      await window.api.rebuildRemoteIndex();
      await refresh();
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Download & restore from SMB share</h2>
        {!mounted && (
          <p className="muted">
            The remote share is not mounted. Mount it from the sidebar first.
          </p>
        )}
        <div className="row">
          <button
            className="primary"
            onClick={refresh}
            disabled={!mounted || busy}
          >
            Refresh remote list
          </button>
          <button onClick={rebuildIndex} disabled={!mounted || busy}>
            Rebuild server index
          </button>
          <span className="muted right">{remote.length} available</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Remote backups</h3>
        {remote.length === 0 ? (
          <Empty>
            {mounted
              ? 'No backups found on the share.'
              : 'Mount the share to list backups.'}
          </Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th />
                <th>File</th>
                <th>Flavor</th>
                <th>Source machine</th>
                <th>Size</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {remote.map((b) => {
                const open = expanded.has(b.name);
                const src = b.meta?.source;
                return (
                  <React.Fragment key={b.path}>
                    <tr>
                      <td>
                        <button
                          className="small"
                          onClick={() => toggle(b.name)}
                          title={open ? 'Hide details' : 'Show details'}
                          style={{ minWidth: 28 }}
                        >
                          {open ? '−' : '+'}
                        </button>
                      </td>
                      <td style={{ wordBreak: 'break-all' }}>{b.name}</td>
                      <td>{b.flavor}</td>
                      <td>
                        {src ? (
                          <>
                            <div>{src.hostname}</div>
                            {src.primaryIp && (
                              <div className="muted" style={{ fontSize: 11 }}>
                                {src.primaryIp}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{formatBytes(b.sizeBytes)}</td>
                      <td>{formatDate(b.createdAtIso)}</td>
                      <td className="row" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="small"
                          disabled={busy}
                          onClick={() => downloadOnly(b.name)}
                        >
                          Download
                        </button>
                        <button
                          className="small primary"
                          disabled={busy}
                          onClick={() => downloadAndRestore(b.name)}
                        >
                          Download & restore
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td />
                        <td colSpan={6}>
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
