# WoW Backup Manager

<div align="center">

![WoW Backup Manager](assets/icon.png)

**A modern, secure backup solution for World of Warcraft addons and settings**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Latest Release](https://img.shields.io/github/v/release/bradthedev/WowSettingBackup)](https://github.com/bradthedev/WowSettingBackup/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/bradthedev/WowSettingBackup/releases)

</div>

## ✨ Features

- 🗂️ **Complete Backup Solution** - Backs up addons (Interface), settings (WTF), and screenshots
- 🕒 **Automated Scheduling** - Set up recurring backups at custom intervals
- 📊 **Backup History** - Track all your backups with detailed metadata and statistics
- 🔧 **Easy Restore** - One-click restoration from backup history or file browser
- 📱 **Modern UI** - Clean, intuitive interface with dark theme
- 🚀 **Fast & Efficient** - Optimized compression with progress tracking
- 🔍 **Verbose Logging** - Detailed logging for troubleshooting
- 🖥️ **Cross-Platform** - Available for Windows, macOS, and Linux
- 📦 **Portable** - No installation required with portable versions

## 🖼️ Screenshots

### Dashboard
Modern dashboard showing system status and quick actions.

### Backup Creation
Create backups with real-time progress tracking.

### Backup History
View all your backups with detailed information and easy management.

### Configuration
Comprehensive settings for customizing your backup experience.

## 📥 Installation

### Download Pre-built Binaries

Visit the [Releases page](https://github.com/bradthedev/WowSettingBackup/releases) and download the appropriate version for your platform:

#### Windows
- **`WoW Backup Manager Setup 1.0.0.exe`** - Standard installer
- **`WoW Backup Manager 1.0.0.exe`** - Portable version (no installation)

#### macOS
- **`WoW Backup Manager-1.0.0.dmg`** - Intel Macs (x64)
- **`WoW Backup Manager-1.0.0-arm64.dmg`** - Apple Silicon Macs (M1/M2)
- **`.zip` versions** - Alternative compressed packages

#### Linux
- **`WoW Backup Manager-1.0.0.AppImage`** - Universal Linux (recommended)
- **`wow-backup-manager_1.0.0_amd64.deb`** - Debian/Ubuntu package

### First-Time Setup

1. **Launch the application**
2. **Configure WoW Path** - Go to Configuration and set your World of Warcraft installation path
3. **Set Backup Directory** - Choose where to save your backups
4. **Configure Preferences** - Adjust settings like compression speed and logging

## 🎮 Usage

### Creating a Backup

1. Go to the **Backup** tab
2. Click **Create Backup** 
3. Monitor progress in real-time
4. Your backup will be automatically added to history

### Restoring a Backup

**From History:**
1. Go to **Backup History** tab
2. Click **Restore** on any completed backup

**From File:**
1. Go to **Restore Backup** tab
2. Click **Browse** to select a backup file
3. Click **Restore Backup**

### Scheduling Automated Backups

1. Go to **Configuration** tab
2. Enable **Scheduler**
3. Set your preferred **interval** (minutes, hours, days)
4. Save configuration
5. Scheduled backups will run automatically

## ⚙️ Configuration Options

### WoW Installation Settings
- **WoW Version** - Select your game version (_retail_, _classic_, _classic_era_)
- **Installation Path** - Path to your World of Warcraft folder

### Backup Settings
- **Backup Directory** - Where to save backup files
- **Retention Period** - How long to keep old backups (days)
- **Fast Compression** - Enable for faster backups with slightly larger files

### Scheduler Settings
- **Enable Scheduler** - Turn on/off automatic backups
- **Interval** - How often to create backups
- **Background Operation** - Run backups even when app is minimized

### Advanced Settings
- **Verbose Logging** - Enable detailed logs for troubleshooting
- **Compression Threads** - Number of CPU threads to use for compression

## 📁 What Gets Backed Up

The application backs up three critical WoW directories:

- **📦 Interface** - All your addons and UI customizations
- **⚙️ WTF** - Game settings, addon configurations, character data
- **📸 Screenshots** - Your in-game screenshots

## 🗂️ Backup File Structure

Backups are saved as compressed ZIP files with this naming format:
```
WoW-Backup-YYYY-MM-DD-HHMMSS.zip
```

Each backup contains:
```
Interface/
├── AddOns/
└── ...
WTF/
├── Account/
├── Config.wtf
└── ...
Screenshots/
└── ...
```

## 🔧 Troubleshooting

### Common Issues

**Backup fails with "Path not found"**
- Verify your WoW installation path in Configuration
- Ensure you have read permissions for the WoW directory

**Restore doesn't work**
- Make sure WoW is completely closed before restoring
- Check that the backup file still exists and isn't corrupted

**Scheduler not working**
- Verify scheduler is enabled in Configuration
- Check logs for any error messages
- Ensure the app has permission to run in the background

### Enable Verbose Logging

1. Go to **Configuration** tab
2. Check **Verbose Logging**
3. Save configuration
4. Reproduce the issue
5. Check logs via the system tray menu → **Open Logs**

### Log Locations

- **Windows**: `%APPDATA%/wow-backup-manager/logs/`
- **macOS**: `~/Library/Application Support/wow-backup-manager/logs/`
- **Linux**: `~/.config/wow-backup-manager/logs/`

## 🛠️ Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Building from Source

```bash
# Clone the repository
git clone https://github.com/bradthedev/WowSettingBackup.git
cd WowSettingBackup

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create distributable packages
npm run dist:all
```

### Development Scripts

- `npm run dev` - Start development with hot reload
- `npm run build` - Build the application
- `npm run dist` - Create platform-specific distributables
- `npm run dist:all` - Build for all platforms
- `npm run dist:win` - Build for Windows only
- `npm run dist:mac` - Build for macOS only  
- `npm run dist:linux` - Build for Linux only

### Project Structure
```
├── src/
│   ├── main/              # Electron main process
│   │   ├── services/      # Backend services (backup, compression, etc.)
│   │   └── main.ts        # Main entry point
│   ├── renderer/          # React frontend
│   │   ├── components/    # React components
│   │   └── App.tsx        # Main React app
│   └── preload.ts         # Preload script for secure IPC
├── assets/                # Application icons and resources
├── .github/workflows/     # GitHub Actions CI/CD
└── package.json
```

### Technologies Used
- **Electron** - Cross-platform desktop application framework
- **React** - Modern UI framework with hooks
- **TypeScript** - Type-safe JavaScript development
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Fast build tool and development server
- **Archiver** - ZIP compression for backups
- **Winston** - Comprehensive logging system
- **electron-store** - Persistent configuration storage

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Release Process

The project uses automated GitHub Actions for building and releasing:

1. **Continuous Integration**: Every push and PR is automatically tested
2. **Release Builds**: Create a tag (e.g., `v1.0.1`) to trigger automatic builds for all platforms
3. **Automated Release**: GitHub releases are created automatically with all platform binaries

To create a new release:
```bash
git tag v1.0.1
git push origin v1.0.1
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Electron](https://electronjs.org/)
- UI components powered by [React](https://reactjs.org/)
- Icons from [Lucide](https://lucide.dev/)
- Compression handled by [Archiver](https://github.com/archiverjs/node-archiver)

## 🔗 Links

- [Download Latest Release](https://github.com/bradthedev/WowSettingBackup/releases)
- [Report Issues](https://github.com/bradthedev/WowSettingBackup/issues)
- [Feature Requests](https://github.com/bradthedev/WowSettingBackup/issues/new)

---

<div align="center">
<strong>Keep your WoW setup safe with WoW Backup Manager!</strong><br>
Never lose your addons, settings, or precious screenshots again.
</div>