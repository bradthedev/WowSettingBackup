import React, { useEffect, useState } from 'react';

export function TitleBar(): React.ReactElement {
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getPlatform().then(setPlatform);
  }, []);

  const isMac = platform === 'darwin';

  return (
    <div
      className="flex items-center h-9 bg-wow-dark-light border-b border-wow-border shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* macOS: traffic lights are on the left, so add padding */}
      {isMac && <div className="w-20" />}

      <div className="flex-1 text-center text-sm font-medium text-wow-text-muted">
        WoW Settings Backup
      </div>

      {/* Windows/Linux: custom window controls on the right */}
      {!isMac && (
        <div
          className="flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => window.electronAPI.window.minimize()}
            className="w-11 h-9 flex items-center justify-center text-wow-text-muted hover:bg-wow-dark-lighter transition-colors"
            aria-label="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
              <rect width="10" height="1" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.window.maximize()}
            className="w-11 h-9 flex items-center justify-center text-wow-text-muted hover:bg-wow-dark-lighter transition-colors"
            aria-label="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.window.close()}
            className="w-11 h-9 flex items-center justify-center text-wow-text-muted hover:bg-red-600 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
