# WoW Settings Backup

A cross-platform desktop app that backs up your World of Warcraft AddOns and
settings, syncs them to an SMB file share, and restores them on another
machine. Built with Electron, TypeScript, and React.

![Platform: macOS | Windows | Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

## Install

Grab the latest build for your OS from the
[Releases page](https://github.com/bradthedev/WowSettingBackup/releases/latest):

- **macOS** — download `WoW-Settings-Backup-<version>.dmg` (Intel) or
  `WoW-Settings-Backup-<version>-arm64.dmg` (Apple Silicon), open it, and drag
  the app into `/Applications`.
- **Windows** — download `WoW-Settings-Backup-Setup-<version>.exe` and run the
  installer. A portable `WoW-Settings-Backup-<version>-win.zip` is also
  provided if you'd rather not use the installer.
- **Linux** — download the `.AppImage`, `chmod +x` it, and run.

The app auto-updates itself from GitHub Releases on launch, so you only need
to do this once per machine.

## Usage

The same app handles all three roles — pick the mode you need from the
sidebar.

1. **Backup** — click **Backup** to create a timestamped zip for each selected
   WoW flavor (`_retail_`, `_classic_`, …). Keeps the last *N* backups per
   flavor.
2. **Upload** — point the app at an SMB share (Settings → SMB share) and use
   **Upload** to push any local zips missing on the share.
3. **Download / Restore** — on another machine, mount the same share, open
   **Download / Restore**, pick a backup, and the app downloads + extracts it
   into the correct WoW flavor folder (stashing the existing `AddOns` / `WTF`
   as `.bak_<timestamp>`).

### Scheduled backups

Settings → Schedule lets you run backups automatically on an interval, at a
fixed daily time, or on a custom cron expression. If the app was closed when
a scheduled backup was due, it will **run a catch-up backup on launch** and
then resume the normal schedule. For example: if the next backup was due at
8:00 AM and you open the app at 10:00 AM, it runs immediately at 10:00 AM and
the next run stays on the regular cadence (12:00 PM, etc.).

### SMB auto-mount

Settings → SMB share stores host, share, username, password, and a local
mount point. Enable **Auto-mount share when the app starts** and the share is
mounted on launch using the OS-native client:

- **macOS**: `mount_smbfs //user:pass@host/share /Volumes/...`
- **Windows**: `net use Z: \\host\share pass /user:user`
- **Linux**: `mount -t cifs //host/share /mnt/... -o username=,password=`
  (requires `cifs-utils`; the process needs permission to run `mount`)

Credentials live in `config.json` under the Electron user-data folder.

### Backup zip format

```
wow-addons_<flavor>_<YYYY-MM-DD_HH-MM-SS>.zip
└── <flavor>/
    ├── AddOns/
    └── WTF/        (if it existed)
```

### Notes / caveats

- The app never force-deletes your existing AddOns/WTF on restore — it renames
  the current folder to `.bak_<timestamp>` first. Clean those up yourself when
  you're confident.
- On macOS/Linux the mount point directory is created automatically. On
  Windows the mount point should be a drive letter like `Z:`.
- On Linux, `mount` usually requires elevated privileges. Configure
  `/etc/fstab` with `user` / `noauto` options or set up `sudo` rules if you
  want non-interactive mounting.

## Building from source

If you'd rather run a local build or contribute changes.

### Prerequisites

- Node.js 18+
- On Linux, `cifs-utils` installed for SMB mounting.

### Develop

```bash
git clone https://github.com/bradthedev/WowSettingBackup.git
cd WowSettingBackup
npm install
npm run dev       # starts Vite + Electron in dev mode
```

### Production build

```bash
npm run build     # compiles main + renderer
npm start         # builds then launches
npm run package   # electron-builder artifact for the current OS
```

### Project layout

```
src/
  main/        Electron main process (IPC, zip, SMB, restore, scheduler)
  preload/     Context-isolated bridge exposed on window.api
  renderer/    React UI
  shared/      Types shared between main and renderer
```

## License

MIT
