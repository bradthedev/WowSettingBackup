import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Dashboard from './components/Dashboard';
import ConfigurationTab from './components/ConfigurationTab';
import BackupTab from './components/BackupTab';
import ImprovedBackupTab from './components/ImprovedBackupTab';
import SchedulerTab from './components/SchedulerTab';
import LogsTab from './components/LogsTab';
import { BackupConfig } from './types';
import { Home, Settings, Archive, Clock, FileText } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    show: false,
    message: '',
    type: 'info',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  useEffect(() => {
    loadConfig();
    setupProgressListener();
    
    return () => {
      window.electron.removeProgressListener();
    };
  }, []);

  const loadConfig = async () => {
    try {
      const loadedConfig = await window.electron.config.get();
      setConfig(loadedConfig);
    } catch (error) {
      showNotification('Failed to load configuration', 'error');
    }
  };

  const saveConfig = async (newConfig: BackupConfig) => {
    try {
      await window.electron.config.save(newConfig);
      setConfig(newConfig);
      showNotification('Configuration saved successfully', 'success');
    } catch (error) {
      showNotification('Failed to save configuration', 'error');
    }
  };

  const setupProgressListener = () => {
    window.electron.onProgressUpdate((data) => {
      setProgress(data.progress);
      setProgressMessage(data.message);
      
      if (data.progress >= 100) {
        setTimeout(() => {
          setIsLoading(false);
          setProgress(0);
          setProgressMessage('');
        }, 1000);
      }
    });
  };

  const showNotification = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  const tabs = [
    { name: 'Dashboard', icon: Home },
    { name: 'Backup & Restore', icon: Archive },
    { name: 'Configuration', icon: Settings },
    { name: 'Scheduler', icon: Clock },
    { name: 'Logs', icon: FileText },
  ];

  if (!config) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wow-blue"></div>
      </div>
    );
  }

  return (
    <>
      <TitleBar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="bg-dark-surface border-b border-dark-border">
          <div className="flex space-x-1 px-4">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              return (
                <button
                  key={index}
                  onClick={() => setActiveTab(index)}
                  className={`flex items-center space-x-2 px-4 py-3 transition-all ${
                    activeTab === index ? 'tab-active' : 'tab-inactive'
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto scrollbar-thin p-6">
          {activeTab === 0 && (
            <Dashboard
              config={config}
              onShowNotification={showNotification}
              setIsLoading={setIsLoading}
              onNavigateToTab={setActiveTab}
            />
          )}
          {activeTab === 1 && (
            <ImprovedBackupTab
              config={config}
              onShowNotification={showNotification}
              setIsLoading={setIsLoading}
            />
          )}
          {activeTab === 2 && (
            <ConfigurationTab
              config={config}
              onSave={saveConfig}
              onShowNotification={showNotification}
            />
          )}
          {activeTab === 3 && (
            <SchedulerTab
              config={config}
              onConfigChange={saveConfig}
              onShowNotification={showNotification}
            />
          )}
          {activeTab === 4 && (
            <LogsTab />
          )}
        </div>

        {/* Progress Bar */}
        {isLoading && (
          <div className="bg-dark-surface border-t border-dark-border p-4">
            <div className="mb-2">
              <div className="w-full bg-dark-bg rounded-full h-2">
                <div
                  className="bg-wow-blue h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
            <p className="text-center text-sm text-gray-400">{progressMessage}</p>
          </div>
        )}
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg animate-slide-up ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error' ? 'bg-red-600' :
          notification.type === 'warning' ? 'bg-yellow-600' :
          'bg-blue-600'
        }`}>
          <p className="text-white">{notification.message}</p>
        </div>
      )}
    </>
  );
};

export default App;