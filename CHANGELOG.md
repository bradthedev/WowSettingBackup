# Changelog

All notable changes to WoW Settings Backup are documented here.

---

## [0.4.2] — 2026-04-23

### Added

- **Catch-up scheduled backups.** If the app was closed when a scheduled
  backup was due, it now runs a catch-up backup on launch and resumes the
  normal cadence. Works for all schedule modes — interval, daily, and custom
  cron. Example: next backup due at 8:00 AM, app reopened at 10:00 AM → runs
  at 10:00 AM, next run stays at 12:00 PM.

### Changed

- **README** restructured to a standard open-source format with a dedicated
  Install section pointing at the Releases page for macOS (DMG), Windows
  (installer / portable zip), and Linux (AppImage). Build-from-source steps
  moved under a Contributors section.

---

## [0.4.1] — 2026-04-23

### Added — Activity dock & background-job visibility

- **Floating Activity dock** in the bottom-right corner replaces the inline
  ProgressPanel. Click the pill to open a popover with the **full session
  history** of every backup, upload, download, scheduled job and sync poll.
  Events are no longer auto-removed after 6 seconds — they stay until you
  hit Clear or restart the app.
- The dock badge animates while jobs are running and turns red when the most
  recent event is an error, so you always know the system is doing something
  even when the popover is closed.
- **Background jobs panel** in Settings shows last-ran timestamp, outcome,
  next-run estimate and detail message for each periodic job: scheduled
  backup, remote-sync poll, update check, and SMB auto-mount. Updates live
  via a new `jobs:updated` IPC broadcast.
- **Manual "Check for updates"** button under a new Settings → Updates
  section. The automatic check still runs every 4 hours and on launch.

### Changed

- Activity event history capped at 200 (was 8) to keep memory bounded across
  long sessions while preserving meaningful history.
- Periodic update poll is now driven by a `setTimeout` chain that is
  rescheduled after every check (manual or automatic), so the next-run
  estimate shown in Settings stays accurate after on-demand checks.

---

## [0.4.0] — 2026-04-23

### Changed — Liquid Glass UI redesign

- **New visual language** across the entire app: translucent glass cards,
  native window vibrancy (macOS `sidebar` + Windows 11 acrylic), soft shadows,
  and tighter typography. The app now feels at home next to the OS instead of
  pasted on top of it.
- **Floating bottom navigation** replaces the left sidebar. Tabs are a
  compact pill dock that floats above content, keeping the main viewport
  clean and focused.
- **Hidden/inset titlebar** on macOS and Windows so glass extends edge-to-edge
  with traffic lights floating over the content area.
- **Mount indicator moved to the header** as a live status chip, with a
  single Mount/Unmount toggle button replacing the old sidebar controls.
- **Status chips everywhere** — share state, schedule state, upload
  present/missing, backup counts, and last-run timestamps all use the same
  consistent chip component.
- **Empty and loading states** added to every list view — skeleton shimmer
  while loading, illustrated empty state when there's nothing yet.
- **Settings reorganised** into six collapsible sections (WoW install,
  Local storage & retention, SMB share, Cross-machine sync, Scheduled
  backups, Appearance) so you can focus on one concern at a time.

### Added

- **Light theme + Auto (system) option** — new three-way theme toggle in the
  header and under Settings → Appearance. The preference is persisted in
  `config.json`, applied instantly, and (when set to "Auto") reacts live to
  OS appearance changes.

---

## [0.3.6] — 2026-04-23

### Fixed

- **Scheduled backups now fire.** The `node-cron` v4 upgrade silently broke the
  scheduler — tasks must now be explicitly `.start()`'d, but the code still
  assumed v3's auto-start behaviour. Scheduled runs now actually execute on
  time.
- **Activity panel no longer gets stuck.** Completed and error events now
  fade out of the panel 6 seconds after they finish, so old events don't pile
  up and block new ones from being visible.

### Added

- **Configurable sync check frequency** — pick from 5 min up to 24 h in
  Settings (default 4 h).
- **Auto-install newer backups** — new opt-in toggle under Settings lets the
  app silently download and restore newer remote backups without prompting.
  Off by default; requires *Check remote share for newer backups* to be on.
- **Scheduler diagnostics** — the Settings page now shows the resolved cron
  expression and the last scheduled-run error (with timestamp) so failures
  are visible instead of hidden in the logs.
- **Run scheduled backup now** button in Settings lets you trigger a scheduled
  run on demand for testing.
- Scheduler status auto-refreshes every 15 seconds while the Settings tab is
  open so the *Next run* display stays accurate.

---

## [0.3.5] — 2026-04-23

### Added

- **Remote sync**: the app now periodically checks the SMB share for backups
  created by other machines. When a newer backup is found a banner appears
  with **Download & Restore** and **Dismiss** options — no silent overwrite,
  always your call.
- New **Settings** toggle: *"Check remote share for newer backups from other
  machines and prompt to restore"* (disabled by default).
- Sync state is persisted in `sync-state.json` so the same backup is never
  offered twice, even after a restart.
- Check runs 10 seconds after launch and every 4 hours thereafter, matching
  the existing update-check cadence.

---

## [0.3.4] — 2026-04-23

### Fixed

- CI now uses a clean `.p12` containing only the Developer ID Application
  certificate and private key, fixing a keychain import failure caused by
  unrelated identities being bundled into the exported certificate.

---

## [0.3.3] — 2026-04-23

### Fixed

- CI keychain import now uses `base64 -d` instead of `base64 --decode` for
  compatibility with the macOS runner.

---

## [0.3.2] — 2026-04-23

### Fixed

- macOS builds are now code-signed with a Developer ID Application certificate
  and notarized by Apple. Builds open on any Mac without Gatekeeper warnings
  or the "damaged app" error.

---

## [0.3.1] — 2026-04-23

### Fixed

- macOS release artifacts now include a `.zip` alongside the `.dmg` for each
  architecture (arm64, x64). Both are unsigned; see the release notes for
  Gatekeeper bypass instructions.
- GitHub Release notes now include a macOS installation note explaining how to
  open an unsigned app via right-click → Open, `xattr`, or System Settings.

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
