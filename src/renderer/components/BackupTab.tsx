import React, { useState, useEffect, useCallback } from 'react';
import type { BackupHistoryItem, BackupResult } from '../types';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function BackupTab(): React.ReactElement {
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [progress, setProgress] = useState<{ value: number; message: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackupResult | null>(null);

  const loadHistory = useCallback(async () => {
    const items = await window.electronAPI.backup.getHistory();
    setHistory(items);
  }, []);

  useEffect(() => {
    loadHistory();
    const unsub = window.electronAPI.onProgressUpdate((value, message) => {
      setProgress({ value, message });
    });
    return unsub;
  }, [loadHistory]);

  const handleBackup = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setProgress({ value: 0, message: 'Starting...' });
    try {
      const res = await window.electronAPI.backup.run();
      setResult(res);
      await loadHistory();
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [loadHistory]);

  const handleRestore = useCallback(async (backupPath: string) => {
    if (!confirm('This will overwrite your current WoW settings. A pre-restore backup will be created. Continue?')) {
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress({ value: 0, message: 'Starting restore...' });
    try {
      const res = await window.electronAPI.backup.restore(backupPath);
      setResult({ success: res.success, message: res.message, duration: res.duration });
      await loadHistory();
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }, [loadHistory]);

  const handleDelete = useCallback(async (id: string) => {
    await window.electronAPI.backup.deleteHistory(id);
    await loadHistory();
  }, [loadHistory]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-wow-gold">Backup</h1>

      {/* Actions */}
      <div className="card">
        <div className="flex items-center gap-4">
          <button onClick={handleBackup} className="btn-primary" disabled={running}>
            {running ? 'Working...' : 'Create Backup'}
          </button>
        </div>

        {progress && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-wow-text-muted mb-1">
              <span>{progress.message}</span>
              <span>{Math.round(progress.value)}%</span>
            </div>
            <div className="w-full bg-wow-dark rounded-full h-2">
              <div
                className="bg-wow-blue-light h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.value}%` }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className={`mt-4 px-4 py-2 rounded-lg text-sm ${
            result.success ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'
          }`}>
            {result.message}
            {result.duration && ` (${formatDuration(result.duration)})`}
          </div>
        )}
      </div>

      {/* History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-wow-text mb-4">Backup History</h2>
        {history.length === 0 ? (
          <p className="text-wow-text-muted text-sm">No backups yet. Create your first backup above.</p>
        ) : (
          <div className="space-y-2">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-wow-dark rounded-lg border border-wow-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm text-wow-text truncate">{item.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-wow-dark-lighter text-wow-text-muted">
                      {item.type}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-wow-text-muted">
                    <span>{formatDate(item.date)}</span>
                    <span>{formatSize(item.size)}</span>
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {item.status === 'success' && (
                    <button
                      onClick={() => handleRestore(item.path)}
                      className="btn-secondary text-xs"
                      disabled={running}
                    >
                      Restore
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                    disabled={running}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
