import React, { useState, useCallback } from 'react';
import type { PairedDevice } from '../types';

interface SyncHostViewProps {
  active: boolean;
  port: number | null;
  pin: string | null;
  pairedDevices: PairedDevice[];
  onStart: () => void;
  onStop: () => void;
  onGeneratePin: () => void;
  onRevokeDevice: (id: string) => void;
}

export function SyncHostView({
  active,
  port,
  pin,
  pairedDevices,
  onStart,
  onStop,
  onGeneratePin,
  onRevokeDevice,
}: SyncHostViewProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {active ? (
          <>
            <span className="text-sm text-green-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Hosting on port {port}
            </span>
            <button onClick={onStop} className="btn-secondary text-xs">
              Stop Hosting
            </button>
          </>
        ) : (
          <button onClick={onStart} className="btn-primary">
            Start Hosting
          </button>
        )}
      </div>

      {active && (
        <>
          {/* PIN Section */}
          <div className="card">
            <h3 className="text-sm font-medium text-wow-text-muted mb-2">Pairing PIN</h3>
            {pin ? (
              <div className="flex items-center gap-4">
                <span className="text-3xl font-mono font-bold text-wow-gold tracking-widest">
                  {pin}
                </span>
                <p className="text-xs text-wow-text-muted">
                  Share this PIN with the device you want to pair. It expires after one use.
                </p>
              </div>
            ) : (
              <button onClick={onGeneratePin} className="btn-gold text-xs">
                Generate PIN
              </button>
            )}
          </div>

          {/* Paired Devices */}
          <div className="card">
            <h3 className="text-sm font-medium text-wow-text-muted mb-2">Paired Devices</h3>
            {pairedDevices.length === 0 ? (
              <p className="text-xs text-wow-text-muted">No paired devices yet.</p>
            ) : (
              <div className="space-y-2">
                {pairedDevices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between py-2 px-3 bg-wow-dark rounded-lg border border-wow-border"
                  >
                    <div>
                      <span className="text-sm text-wow-text">{device.name || device.id.slice(0, 8)}</span>
                      <p className="text-xs text-wow-text-muted">
                        Last seen: {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}
                      </p>
                    </div>
                    <button
                      onClick={() => onRevokeDevice(device.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Revoke
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
