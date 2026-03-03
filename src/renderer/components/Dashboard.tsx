import React, { useState, useEffect, useCallback } from 'react';
import type { BackupHistoryItem, AppConfig } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function Dashboard(): React.ReactElement {
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    window.electronAPI.backup.getHistory().then(setHistory);
    window.electronAPI.config.get().then(setConfig);
  }, []);

  const handleQuickBackup = useCallback(async () => {
    setRunning(true);
    try {
      await window.electronAPI.backup.run();
      const updatedHistory = await window.electronAPI.backup.getHistory();
      setHistory(updatedHistory);
    } finally {
      setRunning(false);
    }
  }, []);

  const lastBackup = history.find((h) => h.status === 'success');
  const totalBackups = history.filter((h) => h.status === 'success').length;
  const totalSize = history.filter((h) => h.status === 'success').reduce((sum, h) => sum + h.size, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-wow-gold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="text-sm font-medium text-wow-text-muted mb-1">Last Backup</h3>
          <p className="text-lg text-wow-text">
            {lastBackup ? formatDate(lastBackup.date) : 'No backups yet'}
          </p>
          {lastBackup && (
            <p className="text-xs text-wow-text-muted mt-1">{lastBackup.name}</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-wow-text-muted mb-1">Total Backups</h3>
          <p className="text-lg text-wow-text">{totalBackups}</p>
          <p className="text-xs text-wow-text-muted mt-1">
            {totalSize > 0 ? `${formatSize(totalSize)} total` : 'No data'}
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-wow-text-muted mb-1">Sync Status</h3>
          <p className="text-lg text-wow-text">
            {config?.syncRole === 'none' ? 'Not configured' : config?.syncRole ?? 'Loading...'}
          </p>
          <p className="text-xs text-wow-text-muted mt-1">
            {config?.wowVersion?.replace(/_/g, '') ?? ''}
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-medium text-wow-text-muted mb-3">Quick Actions</h3>
        <div className="flex gap-3">
          <button onClick={handleQuickBackup} className="btn-primary" disabled={running}>
            {running ? 'Creating...' : 'Create Backup'}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-wow-text-muted mb-3">Recent Backups</h3>
          <div className="space-y-2">
            {history.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 border-b border-wow-border last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-wow-text">{item.name}</span>
                </div>
                <div className="flex gap-4 text-xs text-wow-text-muted">
                  <span>{formatSize(item.size)}</span>
                  <span>{formatDate(item.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
