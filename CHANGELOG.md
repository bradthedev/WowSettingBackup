# Changelog

All notable changes to WoW Settings Backup are documented here.

---

## [0.3.0] — 2026-04-23

### Added

#### Auto-updater
- The app now checks for new releases on GitHub automatically, 5 seconds after
  launch and every 4 hours thereafter.
- Updates are downloaded silently in the background using differential (blockmap)
  downloads — only changed bytes are transferred.
- A banner appears in the main window while the update is downloading, showing
  a progress bar and the incoming version number.
- Once downloaded, the banner changes to a "Restart to install" prompt.
  Clicking it quits the app and installs the update immediately.
- `autoInstallOnAppQuit` is enabled, so the update also installs automatically
  the next time the app is closed normally.
- Auto-update is disabled in development mode so local runs are unaffected.

---

## [0.2.0] — 2026-04-23

### Added

#### Scheduled backups (cron)
- New **Scheduled backups** section in Settings lets you automatically run
  backups on a recurring schedule while the app is open.
- Three scheduling modes available:
  - **Every N hours** — fires at fixed multiples of the chosen hour
    (e.g. every 2 h runs at 00:00, 02:00, 04:00, …).
  - **Daily at a specific time** — runs once per day at the chosen HH:MM
    (24-hour clock).
  - **Custom cron expression** — full 5-field cron string for advanced needs.
- Schedule state (last run time) is persisted to disk so the scheduler can
  reason about missed runs across restarts.
- **Catch-up backup** — if the app was closed when a scheduled backup was due,
  the backup runs automatically ~3 seconds after the next launch.
- **Initial backup** — if the scheduler is enabled but has never run, the first
  backup fires immediately on launch.
- The scheduler honours the **Auto-upload after backup** SMB setting so
  scheduled backups are uploaded to the share automatically.

#### System tray
- The app now lives in the system tray / menu bar and **does not quit when the
  window is closed** with ×. The window is hidden instead, keeping the
  scheduler alive.
- **Tray icon** is rendered at runtime (no external image files required) —
  a gold square on Windows/Linux, a macOS template image that adapts to
  light/dark menu-bar themes.
- **Left-click** the tray icon to show or hide the window.
- **Right-click** (or left-click on macOS) opens a context menu:
  - Show App
  - Run Backup Now (honours auto-upload)
  - Quit
- Clicking **Quit** in the tray menu (or using the OS shutdown) exits cleanly.

#### Time Machine–style retention
- New **Retention strategy** setting with two modes:
  - **Time Machine (default)** — tiered retention that mirrors macOS Time
    Machine behaviour:
    | Age of backup | What is kept |
    |---|---|
    | Last 7 days | Every backup |
    | 7 – 31 days | Most recent backup per ISO week |
    | 31 – 365 days | Most recent backup per calendar month |
    | > 365 days | Most recent backup per year |
  - **Keep N most recent** — the original behaviour; keeps the last N backups
    per flavor and deletes the rest.
- Existing users who upgrade retain their current backups; pruning only
  triggers after the next backup run.

### Changed

- **Settings → Retention** section redesigned: a dropdown selects the
  strategy; the count field only appears in "Keep N most recent" mode.
- Scheduler status (running / stopped, last run, next run) is displayed live
  in Settings after saving.
- `window-all-closed` no longer quits the app on Windows/Linux so the tray
  can keep the process alive.

---

## [0.1.0] — initial release

- Manual backup of WoW AddOns and WTF settings for multiple flavors
  (`_retail_`, `_classic_`, `_classic_era_`, `_ptr_`, `_beta_`, `_classic_ptr_`).
- SMB share auto-mount on launch with OS-native client
  (`mount_smbfs` / `net use` / `mount -t cifs`).
- Auto-upload newly created backups to the mounted share.
- Upload view for pushing local backups to the remote share.
- Download / Restore view: download a remote backup and optionally restore it
  in one click (existing folders are renamed to `.bak_<timestamp>` first).
- Sidecar `.meta.json` files record SHA-256, entry count, source machine info,
  and WoW install root alongside each zip.
- Remote index (`wow-backups-index.json`) for fast listing without scanning
  every file.
- Simple count-based retention (keep last N backups per flavor).
- Cross-platform: macOS (arm64 + x64), Windows, Linux.
