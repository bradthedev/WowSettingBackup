import React, { useEffect, useState } from 'react';
import type { BackupFile } from '../../shared/types';
import { Empty, Skeleton, formatBytes, formatDate } from '../components/format';

export function UploadView({ mounted }: { mounted: boolean }): JSX.Element {
  const [local, setLocal] = useState<BackupFile[] | null>(null);
  const [remote, setRemote] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    setLocal(await window.api.listLocalBackups());
    if (mounted) {
      try {
        setRemote(await window.api.listRemoteBackups());
      } catch (err) {
        console.warn(err);
        setRemote([]);
      }
    } else {
      setRemote([]);
    }
  }

  useEffect(() => {
    refresh();
  }, [mounted]);

  const remoteNames = new Set(remote.map((r) => r.name));
  const localList = local ?? [];
  const uploadable = localList.filter((b) => b.name.endsWith('.zip'));
  const missingCount = uploadable.filter((b) => !remoteNames.has(b.name)).length;

  async function uploadAll(): Promise<void> {
    setBusy(true);
    try {
      for (const b of uploadable) {
        if (!remoteNames.has(b.name)) {
          await window.api.uploadBackup(b.path);
        }
      }
      await refresh();
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadOne(path: string): Promise<void> {
    setBusy(true);
    try {
      await window.api.uploadBackup(path);
      await refresh();
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Upload to share</h2>
          <span className={`chip ${mounted ? 'chip--ok' : 'chip--bad'}`}>
            {mounted ? 'Share mounted' : 'Share offline'}
          </span>
          <span className="chip chip--muted right">
            {localList.length} local · {remote.length} remote
          </span>
        </div>
        {!mounted && (
          <p className="muted" style={{ margin: '0 0 10px' }}>
            The remote share is not mounted. Use the Mount button in the header to
            connect first.
          </p>
        )}
        <div className="row">
          <button
            className="primary"
            disabled={!mounted || busy || missingCount === 0}
            onClick={uploadAll}
          >
            {busy ? 'Uploading…' : `Upload all missing (${missingCount})`}
          </button>
          <button onClick={refresh} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Local backups</h3>
        {local === null ? (
          <Skeleton rows={3} />
        ) : localList.length === 0 ? (
          <Empty icon="↑">Nothing to upload — create a backup first.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Created</th>
                <th>Remote</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {localList.map((b) => {
                const exists = remoteNames.has(b.name);
                return (
                  <tr key={b.path}>
                    <td style={{ wordBreak: 'break-all' }}>{b.name}</td>
                    <td>{formatBytes(b.sizeBytes)}</td>
                    <td>{formatDate(b.createdAtIso)}</td>
                    <td>
                      <span className={`chip ${exists ? 'chip--ok' : 'chip--warn'}`}>
                        {exists ? 'present' : 'missing'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="small"
                        disabled={!mounted || busy || exists}
                        onClick={() => uploadOne(b.path)}
                      >
                        Upload
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
