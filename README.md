# WoW Settings Backup

Electron + TypeScript + React desktop app that backs up your World of Warcraft
AddOns (and WTF settings), syncs the zip files to an SMB file share, and
restores them on another machine.

## Three-machine workflow

1. **Backup machine** — click **Backup** to create a timestamped zip for each
   selected WoW flavor (`_retail_`, `_classic_`, …). Keeps the last *N*
   backups per flavor.
2. **File server (SMB)** — the app mounts an SMB share for you. Use
   **Upload** to push any local zips missing on the share.
3. **Download machine** — mount the same share, open **Download / Restore**,
   pick a backup, and the app downloads + extracts it into the correct WoW
   flavor folder (stashing the existing `AddOns` / `WTF` as `.bak_<timestamp>`).

The app is a single build — the mode is selected via the sidebar, so the same
binary runs on all three machines.

## SMB auto-mount

Settings → SMB share lets you store host, share, username, password, and a
local mount point. Enable **Auto-mount share when the app starts** and the
share is mounted on launch using the OS-native client:

- **macOS**: `mount_smbfs //user:pass@host/share /Volumes/...`
- **Windows**: `net use Z: \\host\share pass /user:user`
- **Linux**: `mount -t cifs //host/share /mnt/... -o username=,password=`
  (requires `cifs-utils`; the process needs permission to run `mount`)

Credentials live in `config.json` under the Electron user-data folder.

## Prerequisites

- Node.js 18+
- On Linux, `cifs-utils` installed for SMB mounting.

## Install & run

```bash
npm install
npm run dev       # starts Vite + Electron in dev mode
```

## Production build

```bash
npm run build     # compiles main + renderer
npm start         # builds then launches
npm run package   # electron-builder artifact for the current OS
```

## Folder layout

```
src/
  main/        Electron main process (IPC, zip, SMB, restore)
  preload/     Context-isolated bridge exposed on window.api
  renderer/    React UI
  shared/      Types shared between main and renderer
```

## Backup zip format

```
wow-addons_<flavor>_<YYYY-MM-DD_HH-MM-SS>.zip
└── <flavor>/
    ├── AddOns/
    └── WTF/        (if it existed)
```

## Notes / caveats

- The app never force-deletes your existing AddOns/WTF on restore — it renames
  the current folder to `.bak_<timestamp>` first. Clean those up yourself when
  you're confident.
- On macOS/Linux the mount point directory is created automatically. On
  Windows the mount point should be a drive letter like `Z:`.
- On Linux, `mount` usually requires elevated privileges. Configure
  `/etc/fstab` with `user` / `noauto` options or set up `sudo` rules if you
  want non-interactive mounting.
