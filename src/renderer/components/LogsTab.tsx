import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LogEntry } from '../types';

const LOG_LEVELS = ['all', 'error', 'warn', 'info', 'debug'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function levelColor(level: string): string {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn': return 'text-yellow-400';
    case 'info': return 'text-wow-blue-light';
    case 'debug': return 'text-wow-text-muted';
    default: return 'text-wow-text';
  }
}

export function LogsTab(): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [logDir, setLogDir] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadLogs = useCallback(async () => {
    try {
      const entries = await window.electronAPI.logs.read(500);
      setLogs(entries);
    } catch {
      setLogs([{
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Failed to read log files',
      }]);
    }
  }, []);

  useEffect(() => {
    loadLogs();
    window.electronAPI.logs.getDir().then(setLogDir);

    // Auto-refresh every 5 seconds
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter((l) => l.level === filter);

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-wow-gold">Logs</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {LOG_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  filter === level
                    ? 'bg-wow-blue text-white'
                    : 'bg-wow-dark-lighter text-wow-text-muted hover:text-wow-text border border-wow-border'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-wow-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-3.5 h-3.5 accent-wow-gold"
            />
            Auto-scroll
          </label>
          <button onClick={loadLogs} className="btn-secondary text-xs">
            Refresh
          </button>
        </div>
      </div>

      {logDir && (
        <p className="text-xs text-wow-text-muted shrink-0">
          Log directory: {logDir}
        </p>
      )}

      <div
        ref={scrollRef}
        className="flex-1 bg-wow-dark border border-wow-border rounded-lg p-3 overflow-y-auto font-mono text-xs min-h-0"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-wow-text-muted">No log entries matching filter.</p>
        ) : (
          filteredLogs.map((entry, i) => (
            <div key={i} className="flex gap-2 py-0.5 hover:bg-wow-dark-light">
              <span className="text-wow-text-muted shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 w-12 text-right ${levelColor(entry.level)}`}>
                [{entry.level.toUpperCase()}]
              </span>
              <span className="text-wow-text break-all">{entry.message}</span>
              {entry.meta && (
                <span className="text-wow-text-muted break-all">{entry.meta}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
