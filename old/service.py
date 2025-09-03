#!/usr/bin/env python3
"""
WoW Backup Service - Background scheduler service
Runs independently of the GUI application
"""

import os
import sys
import json
import time
import subprocess
import shutil
import zipfile
import platform
import threading
import logging
from datetime import datetime, timedelta
from pathlib import Path
from old.compression import CompressionManager

class WoWBackupService:
    def __init__(self, config_file="config.json"):
        # Use the directory where the executable/script is located
        self.app_dir = Path(__file__).parent if hasattr(sys, '_MEIPASS') is False else Path(sys.executable).parent
        self.config_file = self.app_dir / config_file if not os.path.isabs(config_file) else config_file
        self.running = False
        self.config = {}
        self.setup_logging()
        
    def setup_logging(self):
        """Setup logging to file"""
        # Use the directory where the executable/script is located
        log_dir = self.app_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        
        # Create custom formatter without emojis for console
        console_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        
        # File handler
        file_handler = logging.FileHandler(log_dir / 'service.log', encoding='utf-8')
        file_handler.setFormatter(file_formatter)
        
        # Console handler with fallback encoding
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(console_formatter)
        
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        
    def load_config(self):
        """Load configuration from file"""
        if not os.path.exists(self.config_file):
            self.logger.error(f"Config file not found: {self.config_file}")
            return False
            
        try:
            with open(self.config_file, 'r') as f:
                self.config = json.load(f)
            self.logger.info("Configuration loaded successfully")
            return True
        except Exception as e:
            self.logger.error(f"Failed to load config: {e}")
            return False
    
    def is_scheduler_enabled(self):
        """Check if scheduler is enabled in config"""
        return self.config.get('enable_scheduler', False)
    
    def get_schedule_settings(self):
        """Get scheduler settings from config"""
        interval = self.config.get('schedule_interval', 24)
        unit = self.config.get('schedule_unit', 'hours')
        return interval, unit
    
    def calculate_next_backup_time(self, interval, unit):
        """Calculate next backup time"""
        now = datetime.now()
        
        if unit == "minutes":
            return now + timedelta(minutes=interval)
        elif unit == "hours":
            return now + timedelta(hours=interval)
        else:  # days
            return now + timedelta(days=interval)
    
    def validate_paths(self):
        """Validate all required paths"""
        import tempfile
        
        wow_base = self.config.get('wow_base_dir', '')
        wow_version = self.config.get('wow_version', '_retail_')
        
        interface_dir = os.path.join(wow_base, wow_version, "Interface")
        wtf_dir = os.path.join(wow_base, wow_version, "WTF")
        
        # Use OS-appropriate temp directory if not specified
        temp_base = self.config.get('temp_base_dir', '')
        if not temp_base:
            temp_base = os.path.join(tempfile.gettempdir(), "WoWBackup")
            self.config['temp_base_dir'] = temp_base
        
        if not os.path.exists(interface_dir):
            self.logger.error(f"Interface directory not found: {interface_dir}")
            return False
            
        if not os.path.exists(wtf_dir):
            self.logger.error(f"WTF directory not found: {wtf_dir}")
            return False
            
        if not os.path.exists(temp_base):
            try:
                os.makedirs(temp_base, exist_ok=True)
            except Exception as e:
                self.logger.error(f"Cannot create temp directory: {e}")
                return False
                
        return True
    
    def perform_backup(self):
        """Perform the backup operation"""
        try:
            self.logger.info("Starting scheduled backup...")
            
            # Validate paths
            if not self.validate_paths():
                return False
            
            # Setup directories
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_dir = os.path.join(self.config['temp_base_dir'], timestamp)
            
            # Create temp directory
            os.makedirs(temp_dir, exist_ok=True)
            self.logger.info(f"Created temp directory: {temp_dir}")
            
            # Copy directories
            self.copy_wow_directories(temp_dir)
            
            # Compress
            archive_path = self.compress_backup(temp_dir)
            if not archive_path:
                return False
            
            # Move to destination and cleanup
            self.finalize_backup(temp_dir, timestamp, archive_path)
            
            self.logger.info("Scheduled backup completed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Backup failed: {e}")
            return False
    
    def copy_wow_directories(self, temp_dir):
        """Copy Interface and WTF directories"""
        wow_base = self.config['wow_base_dir']
        wow_version = self.config['wow_version']
        
        interface_dir = os.path.join(wow_base, wow_version, "Interface")
        wtf_dir = os.path.join(wow_base, wow_version, "WTF")
        
        # Copy Interface
        self.logger.info("Copying Interface directory...")
        self.robocopy(interface_dir, os.path.join(temp_dir, "Interface"))
        
        # Copy WTF
        self.logger.info("Copying WTF directory...")
        self.robocopy(wtf_dir, os.path.join(temp_dir, "WTF"))
    
    def robocopy(self, source, dest):
        """Use robocopy for fast copying"""
        if platform.system() == 'Windows':
            cmd = ['robocopy', source, dest, '/NFL', '/MIR', '/MT:32', '/NJH']
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode >= 8:
                raise Exception(f"Robocopy failed: {result.stderr}")
        else:
            shutil.copytree(source, dest)
    
    def compress_backup(self, temp_dir):
        """Compress the backup using shared compression utility"""
        self.logger.info("Compressing backup...")
        archive_path = f"{temp_dir}.zip"
        
        # Create compression manager with current settings
        fast_compression = self.config.get('fast_compression', True)
        compression_manager = CompressionManager(
            fast_compression=fast_compression,
            logger=self.logger
        )
        
        # Compress the directory
        success = compression_manager.compress_directory(temp_dir, archive_path)
        
        if success:
            return archive_path
        else:
            raise Exception("Compression failed with all methods")
    
    def finalize_backup(self, temp_dir, timestamp, archive_path):
        """Move backup to destination and cleanup"""
        dest_dir = self.config['dest_dir']
        dest_path = os.path.join(dest_dir, f"{timestamp}.zip")
        
        try:
            # Ensure destination directory exists
            os.makedirs(dest_dir, exist_ok=True)
            
            # Move archive to destination
            shutil.move(archive_path, dest_path)
            
            # Remove temp directory
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            
            # Perform backup rotation
            self.rotate_backups()
            
            # Log final size
            size = os.path.getsize(dest_path)
            self.logger.info(f"Backup saved: {dest_path} ({size:,} bytes)")
            
        except Exception as e:
            raise Exception(f"Finalization failed: {e}")
    
    def rotate_backups(self):
        """Remove old backups - keep last 30 days, then latest per month"""
        try:
            from datetime import datetime, timedelta
            
            dest_dir = self.config['dest_dir']
            
            if not os.path.exists(dest_dir):
                return
                
            backups = []
            for f in os.listdir(dest_dir):
                if f.endswith('.zip'):
                    try:
                        # Extract timestamp from filename (format: YYYYMMDD_HHMMSS.zip)
                        timestamp_str = f.replace('.zip', '')
                        backup_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                        backups.append((f, backup_date))
                    except ValueError:
                        # Skip files that don't match our naming convention
                        continue
            
            if not backups:
                return
                
            # Sort by date (newest first)
            backups.sort(key=lambda x: x[1], reverse=True)
            
            now = datetime.now()
            thirty_days_ago = now - timedelta(days=30)
            
            # Keep all backups from last 30 days
            recent_backups = [b for b in backups if b[1] >= thirty_days_ago]
            old_backups = [b for b in backups if b[1] < thirty_days_ago]
            
            # For old backups, keep only the latest from each month
            monthly_keepers = {}
            for filename, backup_date in old_backups:
                month_key = (backup_date.year, backup_date.month)
                if month_key not in monthly_keepers:
                    monthly_keepers[month_key] = (filename, backup_date)
                elif backup_date > monthly_keepers[month_key][1]:
                    # This backup is newer than the current keeper for this month
                    monthly_keepers[month_key] = (filename, backup_date)
            
            # Combine backups to keep
            backups_to_keep = set(b[0] for b in recent_backups)
            backups_to_keep.update(b[0] for b in monthly_keepers.values())
            
            # Remove backups not in the keep list
            removed_count = 0
            for filename, _ in backups:
                if filename not in backups_to_keep:
                    old_path = os.path.join(dest_dir, filename)
                    os.remove(old_path)
                    self.logger.info(f"Removed old backup: {filename}")
                    removed_count += 1
                    
            if removed_count > 0:
                self.logger.info(f"Backup rotation complete: removed {removed_count} old backups")
                self.logger.info(f"Keeping {len(recent_backups)} recent backups (last 30 days)")
                self.logger.info(f"Keeping {len(monthly_keepers)} monthly backups (latest per month)")
                
        except Exception as e:
            self.logger.error(f"Backup rotation failed: {e}")
    
    def run_service(self):
        """Main service loop"""
        self.logger.info("WoW Backup Service starting...")
        self.running = True
        next_backup_time = None
        
        while self.running:
            try:
                # Reload config periodically
                self.load_config()
                
                if self.is_scheduler_enabled():
                    interval, unit = self.get_schedule_settings()
                    current_time = datetime.now()
                    
                    # Calculate next backup time if not set
                    if next_backup_time is None:
                        next_backup_time = self.calculate_next_backup_time(interval, unit)
                        self.logger.info(f"Next backup scheduled: {next_backup_time.strftime('%Y-%m-%d %H:%M:%S')}")
                    
                    # Check if it's time for backup
                    if current_time >= next_backup_time:
                        if self.perform_backup():
                            # Schedule next backup
                            next_backup_time = self.calculate_next_backup_time(interval, unit)
                            self.logger.info(f"Next backup scheduled: {next_backup_time.strftime('%Y-%m-%d %H:%M:%S')}")
                        else:
                            # Retry in 5 minutes if backup failed
                            next_backup_time = current_time + timedelta(minutes=5)
                            self.logger.info(f"Backup failed, retrying at: {next_backup_time.strftime('%Y-%m-%d %H:%M:%S')}")
                else:
                    next_backup_time = None
                
                # Sleep for 60 seconds before next check
                time.sleep(60)
                
            except KeyboardInterrupt:
                self.logger.info("Service stopped by user")
                break
            except Exception as e:
                self.logger.error(f"Service error: {e}")
                time.sleep(60)
        
        self.running = False
        self.logger.info("WoW Backup Service stopped")
    
    def stop_service(self):
        """Stop the service"""
        self.running = False

def main():
    service = WoWBackupService()
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "install":
            # Install as Windows service (placeholder)
            print("Service installation not implemented yet")
            print("Run 'python service.py' to start the service manually")
        elif sys.argv[1] == "uninstall":
            print("Service uninstallation not implemented yet")
        elif sys.argv[1] == "test":
            # Test backup once
            service.load_config()
            service.perform_backup()
    else:
        # Run service
        try:
            if not service.load_config():
                sys.exit(1)
            service.run_service()
        except KeyboardInterrupt:
            print("\nService stopped by user")

if __name__ == "__main__":
    main()
