import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Download, Trash2 } from 'lucide-react';

const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const loadLogs = async () => {
    const logLines = await window.electron.logs.get(200);
    setLogs(logLines);
  };

  const handleRefresh = () => {
    loadLogs();
  };

  const handleExport = () => {
    const logContent = logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wow-backup-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLogs([]);
    window.electron.logs.send('info', 'Logs cleared by user');
  };

  const getLogLevel = (line: string): string => {
    if (line.includes('ERROR')) return 'text-red-400';
    if (line.includes('WARN')) return 'text-yellow-400';
    if (line.includes('INFO')) return 'text-blue-400';
    if (line.includes('DEBUG')) return 'text-gray-400';
    return 'text-gray-300';
  };

  const formatLogLine = (line: string): { timestamp: string; level: string; message: string } => {
    const match = line.match(/\[(.*?)\]\s*(\w+):\s*(.*)/);
    if (match) {
      return {
        timestamp: match[1],
        level: match[2],
        message: match[3]
      };
    }
    return {
      timestamp: '',
      level: '',
      message: line
    };
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Application Logs</h2>
        
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 text-wow-blue"
            />
            <span>Auto-scroll</span>
          </label>
          
          <button
            onClick={handleRefresh}
            className="btn-secondary flex items-center space-x-2"
            title="Refresh logs"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          
          <button
            onClick={handleExport}
            className="btn-secondary flex items-center space-x-2"
            title="Export logs"
          >
            <Download size={16} />
            <span>Export</span>
          </button>
          
          <button
            onClick={handleClear}
            className="btn-danger flex items-center space-x-2"
            title="Clear logs"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="card p-0">
        <div
          ref={logsContainerRef}
          className="bg-black/50 rounded-xl p-4 h-[500px] overflow-y-auto scrollbar-thin font-mono text-xs"
        >
          {logs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No logs available
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((line, index) => {
                const formatted = formatLogLine(line);
                return (
                  <div key={index} className="flex space-x-2 hover:bg-gray-800/30 px-2 py-0.5 rounded">
                    {formatted.timestamp && (
                      <span className="text-gray-600 shrink-0">{formatted.timestamp}</span>
                    )}
                    {formatted.level && (
                      <span className={`font-bold w-16 shrink-0 ${getLogLevel(line)}`}>
                        {formatted.level}
                      </span>
                    )}
                    <span className="text-gray-300 selectable break-all">
                      {formatted.message}
                    </span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>

      <div className="card bg-blue-900/20 border-blue-600/30">
        <h3 className="text-sm font-medium mb-2 text-blue-400">Log Information</h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Logs are automatically refreshed every 2 seconds</li>
          <li>• Log files are stored in the application data directory</li>
          <li>• Old log files are automatically rotated when they exceed 5MB</li>
        </ul>
      </div>
    </div>
  );
};

export default LogsTab;