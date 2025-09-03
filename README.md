# WoW Backup Manager - TypeScript Electron App

A modern desktop application for backing up World of Warcraft addons and settings, built with TypeScript and Electron.

## Features

- 🎮 **WoW Directory Detection**: Automatically finds your WoW installation
- 💾 **Smart Backup**: Backs up Interface/AddOns and WTF folders
- ⚡ **Fast Compression**: Uses 7z for efficient compression
- 📅 **Scheduled Backups**: Automatic backups with cron-like scheduling
- 🗂️ **Backup Management**: Automatic cleanup (30 days + monthly retention)
- 🎯 **System Tray**: Minimize to tray with context menu
- 🔄 **Progress Tracking**: Real-time backup/restore progress
- ⚙️ **Configurable**: Customizable settings and preferences

## Development Setup

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm (comes with Node.js)
- Windows (for 7z.exe integration)

### Installation

```bash
# Clone the repo and navigate to electron app
cd C:\Repos\WowSettingBackup\electron-app

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the app
npm start
```

### Development Scripts

```bash
# Build TypeScript and start app
npm start

# Watch mode (rebuild on changes)
npm run build:watch

# Development mode with live reload
npm run dev

# Build for production
npm run build

# Package the app (creates distributable)
npm run pack

# Create installer
npm run dist
```

### PowerShell Helper Script

You can also use the PowerShell script for easier development:

```powershell
# Build and run
.\run.ps1 -Build

# Development mode
.\run.ps1 -Dev

# Package for distribution
.\run.ps1 -Pack
```

## Architecture

### TypeScript Structure

```
src/
├── main.ts              # Main Electron process
├── types/               # TypeScript type definitions
└── utils/               # Utility functions

public/
├── index.html          # Renderer HTML
├── renderer.js         # Renderer process
├── styles.css          # Application styles
└── assets/             # Icons and images

dist/                   # Compiled TypeScript output
```

### Key Classes

- **WowBackupApp**: Main application class handling Electron lifecycle
- **AppConfig**: Configuration management and persistence
- **BackupInfo**: Backup metadata and information
- **ProgressInfo**: Progress tracking for operations

## Configuration

The app stores its configuration in `%APPDATA%/wow-backup-manager/config.json`:

```json
{
  "wowPath": "C:/Program Files (x86)/World of Warcraft",
  "backupPath": "C:/Users/username/Documents/WoW Backups",
  "autoBackup": true,
  "backupSchedule": "0 0 * * *",
  "keepDays": 30,
  "compressionLevel": 5,
  "includeAddons": true,
  "includeWTF": true,
  "minimizeToTray": true,
  "startMinimized": false
}
```

## Building for Distribution

### Windows

```bash
# Build installer
npm run build:win

# Output will be in dist-electron/
```

### Requirements for Distribution

- The app includes `7z.exe` from the parent directory
- Icons should be placed in `assets/icon.ico`
- NSIS installer configuration is in `package.json` build section

## TypeScript Benefits

- **Type Safety**: Catch errors at compile time
- **Better IDE Support**: IntelliSense, refactoring, navigation
- **Modern JavaScript Features**: ES6+, async/await, modules
- **Maintainable Code**: Strong typing makes code self-documenting
- **Electron Integration**: Full typing for Electron APIs

## Differences from Python Version

### Advantages:
- **Modern UI**: Web technologies for better UX
- **Cross Platform**: Electron runs on Windows, Mac, Linux
- **Better Performance**: V8 JavaScript engine optimization
- **Rich Ecosystem**: npm packages for any functionality
- **Live Development**: Hot reload and debugging tools

### Migration Notes:
- **Configuration**: JSON-based instead of Python pickle
- **System Tray**: Native Electron tray integration
- **File Operations**: Node.js fs-extra instead of Python shutil
- **Compression**: Uses archiver package with 7z fallback
- **Scheduling**: node-cron instead of Python threading

## Troubleshooting

### Common Issues

1. **npm not found**: Make sure Node.js is installed and added to PATH
2. **TypeScript errors**: Run `npm run build` to see compilation errors
3. **7z.exe missing**: Ensure 7z.exe is in the parent directory
4. **App won't start**: Check console output for errors

### Debugging

```bash
# Run with debug output
DEBUG=* npm start

# Check compiled output
node dist/main.js
```

## Contributing

1. Make changes to TypeScript source files in `src/`
2. Test with `npm run build && npm start`
3. Ensure no TypeScript compilation errors
4. Test packaging with `npm run pack`

## License

MIT License - see the parent directory for details.
