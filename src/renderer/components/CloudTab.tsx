import React, { useState, useEffect, useCallback } from 'react';
import type { CloudStatus, CloudFile, BackupHistoryItem } from '../types';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return 'Unknown';
  return new Date(iso).toLocaleString();
}

interface ProviderCardProps {
  name: string;
  providerId: 'google' | 'dropbox';
  status: CloudStatus | null;
  remoteFiles: CloudFile[];
  backups: BackupHistoryItem[];
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpload: (backupId: string) => void;
  onDownload: (remoteId: string) => void;
  onRefresh: () => void;
}

function ProviderCard({
  name,
  status,
  remoteFiles,
  backups,
  loading,
  onConnect,
  onDisconnect,
  onUpload,
  onDownload,
  onRefresh,
}: ProviderCardProps): React.ReactElement {
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const connected = status?.connected ?? false;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-wow-text">{name}</h2>
        {connected ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Connected {status?.email ? `(${status.email})` : ''}
            </span>
            <button onClick={onDisconnect} className="text-xs text-red-400 hover:text-red-300">
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={onConnect} className="btn-primary text-xs" disabled={loading}>
            Connect
          </button>
        )}
      </div>

      {connected && (
        <>
          {/* Upload */}
          <div>
            <h3 className="text-sm text-wow-text-muted mb-2">Upload Backup</h3>
            <div className="flex gap-2">
              <select
                value={selectedBackup}
                onChange={(e) => setSelectedBackup(e.target.value)}
                className="input-field flex-1"
                disabled={loading}
              >
                <option value="">Select a backup...</option>
                {backups
                  .filter((b) => b.status === 'success')
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({formatSize(b.size)})
                    </option>
                  ))}
              </select>
              <button
                onClick={() => {
                  if (selectedBackup) onUpload(selectedBackup);
                }}
                className="btn-secondary text-xs"
                disabled={!selectedBackup || loading}
              >
                Upload
              </button>
            </div>
          </div>

          {/* Remote files */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-wow-text-muted">Remote Backups</h3>
              <button onClick={onRefresh} className="text-xs text-wow-blue-light hover:underline" disabled={loading}>
                Refresh
              </button>
            </div>
            {remoteFiles.length === 0 ? (
              <p className="text-xs text-wow-text-muted">No remote backups found.</p>
            ) : (
              <div className="space-y-1">
                {remoteFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between py-2 px-3 bg-wow-dark rounded-lg border border-wow-border"
                  >
                    <div>
                      <span className="text-sm text-wow-text">{file.name}</span>
                      <div className="flex gap-3 text-xs text-wow-text-muted mt-0.5">
                        <span>{formatSize(file.size)}</span>
                        <span>{formatDate(file.modifiedTime)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onDownload(file.id)}
                      className="btn-secondary text-xs"
                      disabled={loading}
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CloudTab(): React.ReactElement {
  const [googleStatus, setGoogleStatus] = useState<CloudStatus | null>(null);
  const [dropboxStatus, setDropboxStatus] = useState<CloudStatus | null>(null);
  const [googleFiles, setGoogleFiles] = useState<CloudFile[]>([]);
  const [dropboxFiles, setDropboxFiles] = useState<CloudFile[]>([]);
  const [backups, setBackups] = useState<BackupHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [gStatus, dStatus, history] = await Promise.all([
      window.electronAPI.cloud.getStatus('google'),
      window.electronAPI.cloud.getStatus('dropbox'),
      window.electronAPI.backup.getHistory(),
    ]);
    setGoogleStatus(gStatus);
    setDropboxStatus(dStatus);
    setBackups(history);

    if (gStatus.connected) {
      try {
        const files = await window.electronAPI.cloud.listRemote('google');
        setGoogleFiles(files);
      } catch { /* not connected */ }
    }
    if (dStatus.connected) {
      try {
        const files = await window.electronAPI.cloud.listRemote('dropbox');
        setDropboxFiles(files);
      } catch { /* not connected */ }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleConnect = useCallback(async (provider: 'google' | 'dropbox') => {
    setLoading(true);
    try {
      await window.electronAPI.cloud.authenticate(provider);
      await refresh();
    } catch (err) {
      console.error('Auth failed:', err);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const handleDisconnect = useCallback(async (provider: 'google' | 'dropbox') => {
    await window.electronAPI.cloud.disconnect(provider);
    if (provider === 'google') {
      setGoogleStatus({ connected: false });
      setGoogleFiles([]);
    } else {
      setDropboxStatus({ connected: false });
      setDropboxFiles([]);
    }
  }, []);

  const handleUpload = useCallback(async (backupId: string, provider: 'google' | 'dropbox') => {
    setLoading(true);
    try {
      await window.electronAPI.cloud.upload(backupId, provider);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const handleDownload = useCallback(async (remoteId: string, provider: 'google' | 'dropbox') => {
    setLoading(true);
    try {
      await window.electronAPI.cloud.download(remoteId, provider);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-wow-gold">Cloud</h1>

      <ProviderCard
        name="Google Drive"
        providerId="google"
        status={googleStatus}
        remoteFiles={googleFiles}
        backups={backups}
        loading={loading}
        onConnect={() => handleConnect('google')}
        onDisconnect={() => handleDisconnect('google')}
        onUpload={(id) => handleUpload(id, 'google')}
        onDownload={(id) => handleDownload(id, 'google')}
        onRefresh={refresh}
      />

      <ProviderCard
        name="Dropbox"
        providerId="dropbox"
        status={dropboxStatus}
        remoteFiles={dropboxFiles}
        backups={backups}
        loading={loading}
        onConnect={() => handleConnect('dropbox')}
        onDisconnect={() => handleDisconnect('dropbox')}
        onUpload={(id) => handleUpload(id, 'dropbox')}
        onDownload={(id) => handleDownload(id, 'dropbox')}
        onRefresh={refresh}
      />
    </div>
  );
}
