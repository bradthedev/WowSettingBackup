# Changelog

## [1.0.1] - 2025-01-03

### Performance Improvements
- **Significantly improved compression speed on Windows**
  - Added Windows-specific optimizations with aggressive compression settings
  - Implemented configurable compression levels (store, fastest, fast, normal, maximum)
  - Store mode (no compression) now available for extremely fast backups
  - Reduced default compression level from 3 to 0-1 for fast mode
  - Added parallel file size calculation using all CPU cores
  - Increased buffer sizes to 32MB for better I/O throughput
  - Automatically excludes unnecessary files (*.log, *.tmp, Thumbs.db, .DS_Store)

### Scheduler Enhancements
- **Fixed "invalid date" errors in scheduler**
  - Added robust fallback mechanisms for date calculation
  - Implemented automatic fallback to interval timer if cron fails
  - Always calculates and displays valid next run times
  
- **Added persistent last run time tracking**
  - Last backup times now survive app restarts
  - Displays "Last backup" time in scheduler UI (e.g., "2 hours ago")
  - Separate tracking for manual and scheduled backups
  - Automatically calculates next run based on last run time

### Bug Fixes
- Fixed scheduler not properly initializing on app startup
- Fixed cron expression generation for edge cases (60 minutes, 1440 minutes)
- Improved error handling throughout the scheduler service
- Fixed TypeScript compilation errors in compression service

### Technical Improvements
- Better logging for debugging scheduler and compression issues
- Async file operations to prevent UI blocking
- Improved memory management during compression
- Self-healing scheduler that recovers from errors automatically

### UI Improvements
- Enhanced scheduler status display with last run information
- Better formatting of time displays in scheduler tab
- More informative status messages during compression

## [1.0.0] - 2025-01-02

### Initial Release
- Core backup and restore functionality for WoW settings
- Support for Interface, WTF, and Screenshots folders
- Automated scheduler with configurable intervals
- Backup history tracking and management
- Cross-platform support (Windows, macOS, Linux)
- Modern, user-friendly interface
- System tray integration
- Configurable retention policies
- Fast and normal compression modes