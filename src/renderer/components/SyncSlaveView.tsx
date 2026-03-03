import React, { useState } from 'react';
import type { DiscoveredHost, RemoteBackup, SyncProgress } from '../types';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

interface SyncSlaveViewProps {
  browsing: boolean;
  hosts: DiscoveredHost[];
  connected: boolean;
  syncState: string;
  progress: SyncProgress | null;
  backupList: RemoteBackup[];
  onStartBrowsing: () => void;
  onStopBrowsing: () => void;
  onConnectToHost: (address: string) => void;
  onPairWithPin: (pin: string) => void;
  onRequestBackupList: () => void;
  onStartTransfer: (backupId: string) => void;
  onCancelTransfer: () => void;
}

export function SyncSlaveView({
  browsing,
  hosts,
  connected,
  syncState,
  progress,
  backupList,
  onStartBrowsing,
  onStopBrowsing,
  onConnectToHost,
  onPairWithPin,
  onRequestBackupList,
  onStartTransfer,
  onCancelTransfer,
}: SyncSlaveViewProps): React.ReactElement {
  const [pinInput, setPinInput] = useState('');

  return (
    <div className="space-y-4">
      {/* Browse for hosts */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-wow-text-muted">Discover Hosts</h3>
          {browsing ? (
            <button onClick={onStopBrowsing} className="btn-secondary text-xs">
              Stop Browsing
            </button>
          ) : (
            <button onClick={onStartBrowsing} className="btn-primary text-xs">
              Browse Network
            </button>
          )}
        </div>

        {browsing && hosts.length === 0 && (
          <p className="text-xs text-wow-text-muted flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-wow-blue-light animate-pulse" />
            Searching for hosts...
          </p>
        )}

        {hosts.length > 0 && (
          <div className="space-y-2">
            {hosts.map((host) => (
              <div
                key={host.id}
                className="flex items-center justify-between py-2 px-3 bg-wow-dark rounded-lg border border-wow-border"
              >
                <div>
                  <span className="text-sm text-wow-text">{host.name}</span>
                  <p className="text-xs text-wow-text-muted">
                    {host.address}:{host.port} — {host.wowVersion}
                  </p>
                </div>
                <button
                  onClick={() => onConnectToHost(`${host.address}:${host.port}`)}
                  className="btn-primary text-xs"
                  disabled={connected}
                >
                  Connect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pair with PIN */}
      {connected && syncState !== 'paired' && syncState !== 'authenticated' && (
        <div className="card">
          <h3 className="text-sm font-medium text-wow-text-muted mb-2">Pair with PIN</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit PIN"
              className="input-field w-48 font-mono text-center tracking-widest"
              maxLength={6}
            />
            <button
              onClick={() => {
                if (pinInput.length === 6) onPairWithPin(pinInput);
              }}
              className="btn-gold text-xs"
              disabled={pinInput.length !== 6}
            >
              Pair
            </button>
          </div>
        </div>
      )}

      {/* Sync State */}
      {connected && (syncState === 'paired' || syncState === 'authenticated') && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-wow-text-muted">Connected & Paired</h3>
            <button onClick={onRequestBackupList} className="btn-secondary text-xs">
              Get Backup List
            </button>
          </div>

          {backupList.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs text-wow-text-muted">Available Backups:</h4>
              {backupList.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-2 px-3 bg-wow-dark rounded-lg border border-wow-border"
                >
                  <div>
                    <span className="text-sm text-wow-text">{b.name}</span>
                    <p className="text-xs text-wow-text-muted">
                      {formatSize(b.size)} — {new Date(b.date).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onStartTransfer(b.id)}
                    className="btn-primary text-xs"
                  >
                    Sync
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transfer Progress */}
      {progress && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-wow-text-muted">Transfer Progress</h3>
            <button onClick={onCancelTransfer} className="text-xs text-red-400 hover:text-red-300">
              Cancel
            </button>
          </div>
          <div className="flex justify-between text-xs text-wow-text-muted mb-1">
            <span>{progress.message}</span>
            <span>{Math.round(progress.progress)}%</span>
          </div>
          <div className="w-full bg-wow-dark rounded-full h-2">
            <div
              className="bg-wow-gold h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          {progress.bytesTransferred !== undefined && progress.totalBytes !== undefined && (
            <p className="text-xs text-wow-text-muted mt-1">
              {formatSize(progress.bytesTransferred)} / {formatSize(progress.totalBytes)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
