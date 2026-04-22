import React, { useEffect, useState } from 'react';
import type { BackupFile } from '../../shared/types';
import { Empty, formatBytes, formatDate } from '../components/format';

export function UploadView({ mounted }: { mounted: boolean }): JSX.Element {
  const [local, setLocal] = useState<BackupFile[]>([]);
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

  async function uploadAll(): Promise<void> {
    setBusy(true);
    try {
      for (const b of local) {
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
        <h2 style={{ marginTop: 0 }}>Upload local backups to SMB share</h2>
        {!mounted && (
          <p className="muted">
            The remote share is not mounted. Mount it from the sidebar first.
          </p>
        )}
        <div className="row">
          <button
            className="primary"
            disabled={!mounted || busy || local.length === 0}
            onClick={uploadAll}
          >
            {busy ? 'Uploading…' : 'Upload all missing'}
          </button>
          <button onClick={refresh} disabled={busy}>
            Refresh
          </button>
          <span className="muted right">
            {local.length} local · {remote.length} remote
          </span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Local backups</h3>
        {local.length === 0 ? (
          <Empty>Nothing to upload — create a backup first.</Empty>
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
              {local.map((b) => {
                const exists = remoteNames.has(b.name);
                return (
                  <tr key={b.path}>
                    <td style={{ wordBreak: 'break-all' }}>{b.name}</td>
                    <td>{formatBytes(b.sizeBytes)}</td>
                    <td>{formatDate(b.createdAtIso)}</td>
                    <td>
                      <span className={`status ${exists ? 'ok' : 'bad'}`}>
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
