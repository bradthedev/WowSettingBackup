import React from 'react';
import { X, Minus, Square, Maximize } from 'lucide-react';

const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    window.electron.window.minimize();
  };

  const handleMaximize = () => {
    window.electron.window.maximize();
  };

  const handleClose = () => {
    window.electron.window.close();
  };

  return (
    <div className="bg-dark-surface border-b border-dark-border flex items-center justify-between h-10 window-drag">
      <div className="flex items-center px-4">
        <div className="w-5 h-5 mr-2 bg-wow-blue rounded flex items-center justify-center text-xs font-bold">
          W
        </div>
        <span className="text-sm font-medium">WoW Backup Manager</span>
      </div>
      
      <div className="flex window-no-drag">
        <button
          onClick={handleMinimize}
          className="px-4 py-2 hover:bg-dark-border transition-colors"
          aria-label="Minimize"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={handleMaximize}
          className="px-4 py-2 hover:bg-dark-border transition-colors"
          aria-label="Maximize"
        >
          <Square size={14} />
        </button>
        <button
          onClick={handleClose}
          className="px-4 py-2 hover:bg-red-600 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;