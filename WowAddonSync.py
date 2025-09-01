import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import subprocess
import os
import sys
import threading
import shutil
import json
import platform
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from compression import CompressionManager

try:
    import pystray
    from PIL import Image, ImageDraw
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False

class WoWBackupApp:
    def __init__(self, root):
        self.root = root
        self.root.title("WoW Backup Manager")
        self.root.geometry("800x700")
        self.root.minsize(750, 600)
        
        # Remove default window decorations for custom header
        # But keep it on taskbar by not using overrideredirect
        self.root.resizable(True, True)
        
        # Hide the default title bar but keep taskbar presence
        if platform.system() == 'Windows':
            try:
                # Try to remove title bar on Windows while keeping taskbar
                import ctypes
                from ctypes import wintypes
                
                hwnd = int(self.root.frame(), 16)
                # Remove title bar but keep in taskbar
                style = ctypes.windll.user32.GetWindowLongW(hwnd, -16)  # GWL_STYLE
                style &= ~0x00C00000  # Remove WS_CAPTION
                ctypes.windll.user32.SetWindowLongW(hwnd, -16, style)
                ctypes.windll.user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x0027)  # SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER
            except:
                # Fallback: just use normal window
                pass
        
        # Add a border frame to simulate window border
        self.root.configure(bg='#2c3e50')  # Border color
        
        # Create main content frame with margin for border effect
        self.main_content_frame = tk.Frame(self.root, bg='#f0f0f0')
        self.main_content_frame.pack(fill="both", expand=True, padx=1, pady=(0, 1))
        
        # Variables for window dragging
        self.drag_start_x = 0
        self.drag_start_y = 0
        
        # Modern window styling
        try:
            # Try to load custom theme
            self.root.tk.call('source', 'azure.tcl')
            self.root.tk.call('ttk::style', 'theme', 'use', 'azure')
        except Exception:
            # Fallback to built-in modern theme
            try:
                if platform.system() == 'Windows':
                    self.root.tk.call('ttk::style', 'theme', 'use', 'vista')
                else:
                    self.root.tk.call('ttk::style', 'theme', 'use', 'clam')
            except:
                pass

        # Use the directory where the executable/script is located
        self.app_dir = Path(__file__).parent if hasattr(sys, '_MEIPASS') is False else Path(sys.executable).parent
        self.config_file = self.app_dir / "config.json"
        self.scheduler_thread = None
        self.scheduler_running = False
        self.service_process = None
        self.minimized_to_tray = False
        
        # Service log monitoring
        self.service_log_file = None
        self.service_log_position = 0
        self.log_monitor_thread = None
        self.log_monitor_running = False
        
        # Setup logging
        self.setup_logging()
        
        # Create custom header first
        self.create_custom_header()
        
        # Setup window close handling
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        # Try to setup system tray
        self.setup_tray()
        
        # Start tray icon in background if available
        if TRAY_AVAILABLE and self.tray_icon:
            self.tray_thread = threading.Thread(target=self.tray_icon.run, daemon=True)
            self.tray_thread.start()
        
        self.load_config()

        self.start_time = None
        self.current_operation = ""

        # GUI Elements
        self.create_widgets()
        
        # Setup auto-save functionality after widgets are created
        self.setup_auto_save()
        
        # Start background service if scheduler enabled
        self.start_background_service()

    def setup_logging(self):
        """Setup logging to file and console"""
        # Create logs directory
        log_dir = self.app_dir / "logs"
        log_dir.mkdir(exist_ok=True)
        
        # Create logger
        self.logger = logging.getLogger('WowAddonSync')
        self.logger.setLevel(logging.INFO)
        
        # Remove any existing handlers
        for handler in self.logger.handlers[:]:
            self.logger.removeHandler(handler)
        
        # File handler
        file_handler = logging.FileHandler(log_dir / 'app.log', encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        
        # Console handler (for development)
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # Formatter
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        # Add handlers
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        
        self.logger.info("WowAddonSync logging initialized")

    def _get_hidden_subprocess_kwargs(self):
        """Get subprocess kwargs to hide console windows on Windows"""
        if platform.system() == 'Windows':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE
            
            return {
                'startupinfo': startupinfo,
                'creationflags': subprocess.CREATE_NO_WINDOW
            }
        else:
            return {}

    def start_log_monitoring(self):
        """Start monitoring the service log file for new entries"""
        if not self.log_monitor_running:
            self.service_log_file = self.app_dir / "logs" / "service.log"
            self.log_monitor_running = True
            self.log_monitor_thread = threading.Thread(target=self._monitor_service_log, daemon=True)
            self.log_monitor_thread.start()

    def stop_log_monitoring(self):
        """Stop monitoring the service log file"""
        self.log_monitor_running = False

    def _monitor_service_log(self):
        """Monitor service log file for new entries"""
        while self.log_monitor_running:
            try:
                if self.service_log_file.exists():
                    with open(self.service_log_file, 'r', encoding='utf-8') as f:
                        f.seek(self.service_log_position)
                        new_lines = f.readlines()
                        self.service_log_position = f.tell()
                        
                        # Display new log lines in activity log
                        for line in new_lines:
                            line = line.strip()
                            if line and 'INFO -' in line:
                                # Extract just the message part
                                try:
                                    msg = line.split('INFO - ', 1)[1]
                                    # Skip duplicate messages that are already in main app
                                    if not any(skip in msg for skip in ['Background scheduler', 'WoW Backup Service']):
                                        self.root.after(0, lambda m=msg: self.log(f"🔧 {m}"))
                                except:
                                    pass
                
                time.sleep(1)  # Check every second
            except Exception as e:
                # Silently handle errors
                time.sleep(2)

    def load_config(self):
        # Get OS-appropriate directories
        import tempfile
        default_temp_base = os.path.join(tempfile.gettempdir(), "WoWBackup")
        
        # OS-appropriate WoW default installation path
        if platform.system() == 'Windows':
            default_wow_path = "C:\\Program Files (x86)\\World of Warcraft"
            if not os.path.exists(default_wow_path):
                default_wow_path = "C:\\World of Warcraft"
        elif platform.system() == 'Darwin':  # macOS
            default_wow_path = "/Applications/World of Warcraft"
        else:  # Linux and others
            default_wow_path = os.path.expanduser("~/Games/world-of-warcraft")
        
        # OS-appropriate default backup destination
        if platform.system() == 'Windows':
            default_dest = "\\\\TOWER\\NasBackup\\WoWAddonBackup"
        else:
            default_dest = os.path.expanduser("~/WoWBackups")
        
        # Default values with OS-appropriate directories
        self.wow_version = tk.StringVar(value="_retail_")
        self.wow_base_dir = tk.StringVar(value=default_wow_path)
        self.temp_base_dir = tk.StringVar(value=default_temp_base)
        self.dest_dir = tk.StringVar(value=default_dest)
        self.verbose = tk.BooleanVar(value=False)
        self.fast_compression = tk.BooleanVar(value=True)
        
        # Scheduler settings
        self.enable_scheduler = tk.BooleanVar(value=False)
        self.schedule_interval = tk.IntVar(value=24)
        self.schedule_unit = tk.StringVar(value="hours")

        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                    self.wow_version.set(config.get('wow_version', '_retail_'))
                    self.wow_base_dir.set(config.get('wow_base_dir', 'C:\\World of Warcraft'))
                    self.temp_base_dir.set(config.get('temp_base_dir', 'D:\\WoWBackUp'))
                    self.dest_dir.set(config.get('dest_dir', '\\\\TOWER\\NasBackup\\WoWAddonBackup'))
                    self.verbose.set(config.get('verbose', False))
                    self.fast_compression.set(config.get('fast_compression', True))
                    self.enable_scheduler.set(config.get('enable_scheduler', False))
                    self.schedule_interval.set(config.get('schedule_interval', 24))
                    self.schedule_unit.set(config.get('schedule_unit', 'hours'))
            except Exception as e:
                self.log(f"Error loading config: {e}")

    def save_config(self):
        config = {
            'wow_version': self.wow_version.get(),
            'wow_base_dir': self.wow_base_dir.get(),
            'temp_base_dir': self.temp_base_dir.get(),
            'dest_dir': self.dest_dir.get(),
            'verbose': self.verbose.get(),
            'fast_compression': self.fast_compression.get(),
            'enable_scheduler': self.enable_scheduler.get(),
            'schedule_interval': self.schedule_interval.get(),
            'schedule_unit': self.schedule_unit.get()
        }
        try:
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=4)
            messagebox.showinfo("Config Saved", "Configuration saved successfully!")
            self.update_scheduler()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save config: {e}")
    
    def auto_save_config(self, *args):
        """Auto-save configuration without popup message (with debouncing)"""
        # Cancel any existing pending auto-save
        if hasattr(self, 'auto_save_timer'):
            self.root.after_cancel(self.auto_save_timer)
        
        # Schedule auto-save after a short delay to avoid excessive saves
        self.auto_save_timer = self.root.after(1000, self._perform_auto_save)  # 1 second delay
    
    def _perform_auto_save(self):
        """Actually perform the auto-save operation"""
        config = {
            'wow_version': self.wow_version.get(),
            'wow_base_dir': self.wow_base_dir.get(),
            'temp_base_dir': self.temp_base_dir.get(),
            'dest_dir': self.dest_dir.get(),
            'verbose': self.verbose.get(),
            'fast_compression': self.fast_compression.get(),
            'enable_scheduler': self.enable_scheduler.get(),
            'schedule_interval': self.schedule_interval.get(),
            'schedule_unit': self.schedule_unit.get()
        }
        try:
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=4)
            # Update scheduler when auto-saving
            self.update_scheduler()
            # Optional: Show subtle feedback in status/log
            if hasattr(self, 'log_text'):
                self.log("⚙️ Configuration auto-saved")
        except Exception as e:
            if hasattr(self, 'log_text'):
                self.log(f"❌ Auto-save failed: {e}")
    
    def setup_auto_save(self):
        """Setup automatic saving when configuration changes"""
        # Add trace callbacks to all configuration variables
        self.wow_version.trace_add('write', self.auto_save_config)
        self.wow_base_dir.trace_add('write', self.auto_save_config)
        self.temp_base_dir.trace_add('write', self.auto_save_config)
        self.dest_dir.trace_add('write', self.auto_save_config)
        self.verbose.trace_add('write', self.auto_save_config)
        self.fast_compression.trace_add('write', self.auto_save_config)
        self.enable_scheduler.trace_add('write', self.auto_save_config)
        self.schedule_interval.trace_add('write', self.auto_save_config)
        self.schedule_unit.trace_add('write', self.auto_save_config)

    def create_custom_header(self):
        """Create a custom title bar with minimize, maximize, and close buttons"""
        # Main header frame
        header_frame = tk.Frame(self.main_content_frame, bg='#2c3e50', height=35)
        header_frame.pack(fill="x", side="top")
        header_frame.pack_propagate(False)
        
        # Title label on the left
        title_label = tk.Label(header_frame, text="🎮 WoW Backup Manager", 
                              bg='#2c3e50', fg='white', font=('Segoe UI', 10, 'bold'))
        title_label.pack(side="left", padx=15, pady=8)
        
        # Button frame on the right
        button_frame = tk.Frame(header_frame, bg='#2c3e50')
        button_frame.pack(side="right", padx=5, pady=5)
        
        # Minimize button
        minimize_btn = tk.Button(button_frame, text="—", font=('Segoe UI', 10, 'bold'),
                               bg='#34495e', fg='white', relief="flat", width=3, height=1,
                               command=self.minimize_window, bd=0, highlightthickness=0)
        minimize_btn.pack(side="left", padx=2)
        minimize_btn.bind("<Enter>", lambda e: minimize_btn.configure(bg='#5a6b7d'))
        minimize_btn.bind("<Leave>", lambda e: minimize_btn.configure(bg='#34495e'))
        
        # Maximize button
        maximize_btn = tk.Button(button_frame, text="□", font=('Segoe UI', 10, 'bold'),
                               bg='#34495e', fg='white', relief="flat", width=3, height=1,
                               command=self.toggle_maximize, bd=0, highlightthickness=0)
        maximize_btn.pack(side="left", padx=2)
        maximize_btn.bind("<Enter>", lambda e: maximize_btn.configure(bg='#5a6b7d'))
        maximize_btn.bind("<Leave>", lambda e: maximize_btn.configure(bg='#34495e'))
        
        # Close button with different hover color
        close_btn = tk.Button(button_frame, text="✕", font=('Segoe UI', 10, 'bold'),
                             bg='#34495e', fg='white', relief="flat", width=3, height=1,
                             command=self.on_closing, bd=0, highlightthickness=0)
        close_btn.pack(side="left", padx=2)
        close_btn.bind("<Enter>", lambda e: close_btn.configure(bg='#e74c3c'))
        close_btn.bind("<Leave>", lambda e: close_btn.configure(bg='#34495e'))
        
        # Make header draggable
        header_frame.bind("<Button-1>", self.start_move)
        header_frame.bind("<B1-Motion>", self.on_move)
        title_label.bind("<Button-1>", self.start_move)
        title_label.bind("<B1-Motion>", self.on_move)
        
        # Double-click to maximize/restore
        header_frame.bind("<Double-Button-1>", lambda e: self.toggle_maximize())
        title_label.bind("<Double-Button-1>", lambda e: self.toggle_maximize())
        
        # Store header frame for resizing
        self.header_frame = header_frame
    
    def start_move(self, event):
        """Start window dragging"""
        self.drag_start_x = event.x
        self.drag_start_y = event.y
    
    def on_move(self, event):
        """Handle window dragging"""
        x = (event.x_root - self.drag_start_x)
        y = (event.y_root - self.drag_start_y)
        self.root.geometry(f"+{x}+{y}")
    
    def minimize_window(self):
        """Minimize window - to tray if available, otherwise to taskbar"""
        if TRAY_AVAILABLE and self.tray_icon:
            self.minimize_to_tray()
        else:
            self.root.iconify()

    def toggle_maximize(self):
        """Toggle between maximized and normal window state"""
        if not hasattr(self, 'is_maximized'):
            self.is_maximized = False
            
        if self.is_maximized:
            # Restore to normal size
            self.root.state('normal')
            self.is_maximized = False
        else:
            # Maximize window
            self.root.state('zoomed')
            self.is_maximized = True

    def create_widgets(self):
        # Modern Style Configuration
        style = ttk.Style()
        
        # Use the best available theme
        available_themes = style.theme_names()
        if 'vista' in available_themes:
            style.theme_use('vista')
        elif 'winnative' in available_themes:
            style.theme_use('winnative')
        else:
            style.theme_use('clam')
        
        # Modern color scheme
        bg_color = "#f0f0f0"
        accent_color = "#0078d4"
        text_color = "#323130"
        
        # Configure styles using standard ttk style names
        style.configure('TLabel', font=('Segoe UI', 10), foreground=text_color)
        style.configure('TButton', font=('Segoe UI', 10), padding=(15, 8))
        style.configure('TFrame', background=bg_color)
        style.configure('TLabelFrame', font=('Segoe UI', 10, 'bold'))
        style.configure('TEntry', font=('Segoe UI', 10))
        style.configure('TCheckbutton', font=('Segoe UI', 10))
        style.configure('TCombobox', font=('Segoe UI', 10))
        
        # Configure button hover effects
        style.map('TButton',
                  background=[('active', '#e1dfdd'),
                             ('pressed', '#d2d0ce')])
        
        self.root.configure(bg=bg_color)

        # Main container (padding adjusted for custom header)
        main_container = ttk.Frame(self.main_content_frame)
        main_container.pack(fill="both", expand=True, padx=20, pady=15)

        # Configuration Card
        config_card = ttk.LabelFrame(main_container, text="  Configuration  ", padding=20)
        config_card.pack(fill="x", pady=(0, 15))

        # Create a grid layout for config
        config_grid = ttk.Frame(config_card)
        config_grid.pack(fill="x")

        # Row 0: WoW Version and Base Dir
        row0 = ttk.Frame(config_grid)
        row0.pack(fill="x", pady=5)
        
        ttk.Label(row0, text="WoW Version:").pack(side="left", padx=(0, 10))
        version_entry = ttk.Entry(row0, textvariable=self.wow_version, width=15)
        version_entry.pack(side="left", padx=(0, 20))
        version_entry.bind('<FocusOut>', self.auto_save_config)
        
        ttk.Label(row0, text="WoW Installation:").pack(side="left", padx=(0, 10))
        wow_base_entry = ttk.Entry(row0, textvariable=self.wow_base_dir)
        wow_base_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        wow_base_entry.bind('<FocusOut>', self.auto_save_config)
        ttk.Button(row0, text="📁", command=lambda: self.browse_dir(self.wow_base_dir), width=3).pack(side="right")

        # Row 1: Temp and Dest directories
        row1 = ttk.Frame(config_grid)
        row1.pack(fill="x", pady=5)
        
        ttk.Label(row1, text="Temp Directory:").pack(side="left", padx=(0, 10))
        temp_entry = ttk.Entry(row1, textvariable=self.temp_base_dir)
        temp_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        temp_entry.bind('<FocusOut>', self.auto_save_config)
        ttk.Button(row1, text="📁", command=lambda: self.browse_dir(self.temp_base_dir), width=3).pack(side="right")

        row2 = ttk.Frame(config_grid)
        row2.pack(fill="x", pady=5)
        
        ttk.Label(row2, text="Backup Destination:").pack(side="left", padx=(0, 10))
        dest_entry = ttk.Entry(row2, textvariable=self.dest_dir)
        dest_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))
        dest_entry.bind('<FocusOut>', self.auto_save_config)
        ttk.Button(row2, text="📁", command=lambda: self.browse_dir(self.dest_dir), width=3).pack(side="right")

        # Row 3: Settings and Info
        row3 = ttk.Frame(config_grid)
        row3.pack(fill="x", pady=10)
        
        # Checkboxes
        ttk.Checkbutton(row3, text="Verbose Logging", variable=self.verbose).pack(side="left", padx=(0, 15))
        ttk.Checkbutton(row3, text="Fast Compression", variable=self.fast_compression).pack(side="left")
        
        # Backup retention info
        info_frame = ttk.Frame(config_grid)
        info_frame.pack(fill="x", pady=(10, 0))
        
        retention_info = ttk.Label(info_frame, 
                                 text="📅 Backup Retention: Keeps all backups from last 30 days, then latest backup per month for older backups",
                                 font=('Segoe UI', 9), foreground='#605e5c')
        retention_info.pack(anchor="w")

        # Scheduler Card
        scheduler_card = ttk.LabelFrame(main_container, text="  🕒 Automatic Scheduler  ", padding=20)
        scheduler_card.pack(fill="x", pady=(0, 15))
        
        scheduler_row1 = ttk.Frame(scheduler_card)
        scheduler_row1.pack(fill="x", pady=5)
        
        # Create a custom style for bold checkbutton
        style.configure('Bold.TCheckbutton', font=('Segoe UI', 10, 'bold'))
        ttk.Checkbutton(scheduler_row1, text="Enable automatic backups", variable=self.enable_scheduler, 
                       command=self.toggle_scheduler, style='Bold.TCheckbutton').pack(side="left")
        
        scheduler_row2 = ttk.Frame(scheduler_card)
        scheduler_row2.pack(fill="x", pady=10)
        
        ttk.Label(scheduler_row2, text="Run every:").pack(side="left", padx=(0, 10))
        interval_spinbox = ttk.Spinbox(scheduler_row2, from_=1, to=999, textvariable=self.schedule_interval, width=5)
        interval_spinbox.pack(side="left", padx=(0, 10))
        
        unit_combo = ttk.Combobox(scheduler_row2, textvariable=self.schedule_unit, values=["minutes", "hours", "days"], 
                                 width=10, state="readonly")
        unit_combo.pack(side="left", padx=(0, 20))
        
        # Scheduler status
        self.scheduler_status = ttk.Label(scheduler_row2, text="", foreground='#107c10')
        self.scheduler_status.pack(side="left", padx=(20, 0))

        # Action Buttons Card
        button_card = ttk.Frame(main_container)
        button_card.pack(fill="x", pady=(0, 15))

        # Primary action buttons
        primary_buttons = ttk.Frame(button_card)
        primary_buttons.pack(side="left")
        
        backup_btn = ttk.Button(primary_buttons, text="🚀 Run Backup Now", command=self.run_backup)
        backup_btn.pack(side="left", padx=(0, 10))
        
        restore_btn = ttk.Button(primary_buttons, text="📦 Restore Backup", command=self.run_restore)
        restore_btn.pack(side="left", padx=(0, 20))

        # Secondary buttons
        secondary_buttons = ttk.Frame(button_card)
        secondary_buttons.pack(side="right")
        
        ttk.Button(secondary_buttons, text="💾 Save Config", command=self.save_config).pack(side="left", padx=(0, 10))
        ttk.Button(secondary_buttons, text="🗑️ Clear Log", command=self.clear_log).pack(side="left")

        # Progress Card
        progress_card = ttk.LabelFrame(main_container, text="  Progress & Status  ", padding=15)
        progress_card.pack(fill="x", pady=(0, 15))

        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(progress_card, variable=self.progress_var, maximum=100, length=400)
        self.progress_bar.pack(fill="x", pady=(0, 8))

        self.status_label = ttk.Label(progress_card, text="Ready to backup")
        self.status_label.pack(anchor="w")

        # Log Card with modern text area
        log_card = ttk.LabelFrame(main_container, text="  📋 Activity Log  ", padding=15)
        log_card.pack(fill="both", expand=True)

        # Create text widget with modern styling
        self.log_text = scrolledtext.ScrolledText(log_card, wrap=tk.WORD, height=12, 
                                                 font=('Consolas', 9), bg='#ffffff', fg='#323130',
                                                 selectbackground='#0078d4', selectforeground='white',
                                                 relief='flat', borderwidth=1)
        self.log_text.pack(fill="both", expand=True)
        
        # Add welcome message
        self.log("🎮 WoW Backup Manager initialized")
        self.log("💡 Configure your paths and click 'Run Backup Now' to get started")
        self.logger.info("WoW Backup Manager GUI initialized")

    def browse_dir(self, var):
        dir_path = filedialog.askdirectory()
        if dir_path:
            var.set(dir_path)
            # Trigger auto-save after directory selection
            self.auto_save_config()

    def update_progress(self, value, status):
        self.progress_var.set(value)
        self.status_label.config(text=status)
        self.root.update_idletasks()

    def start_operation(self, operation_name):
        self.start_time = datetime.now()
        self.current_operation = operation_name
        self.update_progress(0, f"Starting {operation_name}...")

    def update_progress_with_eta(self, value, status):
        if self.start_time and value > 0:
            elapsed = (datetime.now() - self.start_time).total_seconds()
            if elapsed > 0:
                # Estimate total time based on current progress
                estimated_total = elapsed / (value / 100.0)
                remaining = estimated_total - elapsed
                
                if remaining > 0:
                    if remaining < 60:
                        eta_text = f"{remaining:.0f}s remaining"
                    elif remaining < 3600:
                        eta_text = f"{remaining/60:.1f}min remaining"
                    else:
                        eta_text = f"{remaining/3600:.1f}hr remaining"
                    
                    status = f"{status} ({eta_text})"
        
        self.update_progress(value, status)

    def log(self, message):
        """Log message to both file and UI"""
        timestamp = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
        
        # Log to file via logger
        if hasattr(self, 'logger'):
            # Clean message for file logging (remove emojis for better file compatibility)
            clean_message = message.encode('ascii', 'ignore').decode('ascii').strip()
            if clean_message:
                self.logger.info(clean_message)
            else:
                self.logger.info(message)  # Keep original if cleaning removed everything
        
        # Log to UI text widget
        if hasattr(self, 'log_text'):
            self.log_text.insert(tk.END, f"{timestamp} {message}\n")
            self.log_text.see(tk.END)

    def run_backup(self):
        """Start backup in background thread"""
        backup_thread = threading.Thread(target=self._backup_operation, daemon=True)
        backup_thread.start()

    def _backup_operation(self):
        """Main backup operation"""
        try:
            self.start_operation("Backup")
            self.logger.info("Starting backup operation")
            
            # Validate paths
            if not self._validate_backup_paths():
                self.logger.error("Backup validation failed")
                return
                
            # Setup directories
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_dir = os.path.join(self.temp_base_dir.get(), timestamp)
            
            # Create temp directory
            self._create_temp_directory(temp_dir)
            
            # Copy directories
            self._copy_wow_directories(temp_dir)
            
            # Compress
            self._compress_backup(temp_dir)
            
            # Move to destination and cleanup
            self._finalize_backup(temp_dir, timestamp)
            
            self.update_progress(100, "Backup completed successfully!")
            self.log("✅ Backup operation completed successfully")
            self.logger.info("Backup operation completed successfully")
            
        except Exception as e:
            self.log(f"❌ Backup failed: {e}")
            self.logger.error(f"Backup operation failed: {str(e)}")
            self.update_progress(0, "Backup failed")
        finally:
            self.root.config(cursor="")

    def _validate_backup_paths(self):
        """Validate all required paths exist"""
        wow_base = self.wow_base_dir.get()
        wow_version = self.wow_version.get()
        
        interface_dir = os.path.join(wow_base, wow_version, "Interface")
        wtf_dir = os.path.join(wow_base, wow_version, "WTF")
        
        if not os.path.exists(interface_dir):
            self.log(f"❌ Interface directory not found: {interface_dir}")
            return False
            
        if not os.path.exists(wtf_dir):
            self.log(f"❌ WTF directory not found: {wtf_dir}")
            return False
            
        if not os.path.exists(self.temp_base_dir.get()):
            try:
                os.makedirs(self.temp_base_dir.get())
            except Exception as e:
                self.log(f"❌ Cannot create temp directory: {e}")
                return False
                
        return True

    def _create_temp_directory(self, temp_dir):
        """Create temporary backup directory"""
        self.update_progress(5, "Creating temporary directory...")
        try:
            os.makedirs(temp_dir, exist_ok=True)
            self.log(f"📁 Created temp directory: {temp_dir}")
        except Exception as e:
            raise Exception(f"Failed to create temp directory: {e}")

    def _copy_wow_directories(self, temp_dir):
        """Copy Interface and WTF directories"""
        wow_base = self.wow_base_dir.get()
        wow_version = self.wow_version.get()
        
        interface_dir = os.path.join(wow_base, wow_version, "Interface")
        wtf_dir = os.path.join(wow_base, wow_version, "WTF")
        
        # Copy Interface
        self.update_progress(10, "Copying Interface directory...")
        self._robocopy(interface_dir, os.path.join(temp_dir, "Interface"))
        self.update_progress(35, "Interface copied")
        
        # Copy WTF
        self.update_progress(40, "Copying WTF directory...")
        self._robocopy(wtf_dir, os.path.join(temp_dir, "WTF"))
        self.update_progress(65, "WTF copied")

    def _robocopy(self, source, dest):
        """Use robocopy for fast multi-threaded copying"""
        try:
            if platform.system() == 'Windows':
                cmd = ['robocopy', source, dest, '/NFL', '/MIR', '/MT:32', '/NJH']
                
                # Hide console window
                subprocess_kwargs = self._get_hidden_subprocess_kwargs()
                
                result = subprocess.run(cmd, capture_output=True, text=True, **subprocess_kwargs)
                if result.returncode >= 8:
                    raise Exception(f"Robocopy failed: {result.stderr}")
            else:
                # Fallback for non-Windows systems
                shutil.copytree(source, dest)
        except Exception as e:
            raise Exception(f"Copy operation failed: {e}")

    def _compress_backup(self, temp_dir):
        """Compress the backup using shared compression utility"""
        archive_path = f"{temp_dir}.zip"
        
        # Create compression manager with current settings
        compression_manager = CompressionManager(
            fast_compression=self.fast_compression.get(),
            logger=None  # We'll use our own logging
        )
        
        # Define progress callback to update UI
        def progress_callback(value, status):
            self.update_progress(value, status)
            # Map compression manager messages to our emoji logging
            if "7-Zip" in status:
                self.log("🗜️ " + status)
            elif "zipfile" in status:
                self.log("🗜️ " + status)
        
        # Compress the directory
        success = compression_manager.compress_directory(temp_dir, archive_path, progress_callback)
        
        if success:
            return archive_path
        else:
            raise Exception("Compression failed with all methods")

    def _finalize_backup(self, temp_dir, timestamp):
        """Move backup to destination and cleanup"""
        self.update_progress(90, "Finalizing backup...")
        
        archive_path = f"{temp_dir}.zip"
        dest_path = os.path.join(self.dest_dir.get(), f"{timestamp}.zip")
        
        try:
            # Ensure destination directory exists
            os.makedirs(self.dest_dir.get(), exist_ok=True)
            
            # Move archive to destination
            shutil.move(archive_path, dest_path)
            
            # Remove temp directory
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            
            # Perform backup rotation
            self._rotate_backups()
            
            # Log final size
            size = os.path.getsize(dest_path)
            self.log(f"📦 Backup saved: {dest_path} ({size:,} bytes)")
            
        except Exception as e:
            raise Exception(f"Finalization failed: {e}")

    def _rotate_backups(self):
        """Remove old backups - keep last 30 days, then latest per month"""
        try:
            from datetime import datetime, timedelta
            
            dest_dir = self.dest_dir.get()
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
                    self.log(f"🗑️ Removed old backup: {filename}")
                    removed_count += 1
                    
            if removed_count > 0:
                self.log(f"📦 Backup rotation complete: removed {removed_count} old backups")
                self.log(f"📅 Keeping {len(recent_backups)} recent backups (last 30 days)")
                self.log(f"📆 Keeping {len(monthly_keepers)} monthly backups (latest per month)")
                
        except Exception as e:
            self.log(f"Warning: Backup rotation failed: {e}")

    def run_restore(self):
        """Start the restore process by selecting a backup file"""
        zip_file = filedialog.askopenfilename(
            title="Select Backup Archive",
            filetypes=[("Zip files", "*.zip"), ("All files", "*.*")]
        )
        if not zip_file:
            return

        # Confirm overwrite
        if not messagebox.askyesno("Confirm Restore", 
                                   "This will overwrite existing WoW addons and settings.\n\n"
                                   "Make sure WoW is closed before proceeding.\n\n"
                                   "Continue?"):
            return

        # Disable UI and start restore
        self.root.config(cursor="wait")
        self.start_operation("restore")
        self.log(f"🔄 Starting restore from: {os.path.basename(zip_file)}")

        # Run in thread to keep UI responsive
        thread = threading.Thread(target=self.perform_restore, args=(zip_file,))
        thread.start()

    def perform_restore(self, zip_file):
        """Perform the actual restore operation"""
        try:
            self.update_progress(0, "Initializing restore...")
            self.logger.info(f"Starting restore operation from: {zip_file}")
            
            # Validate backup file exists
            if not os.path.exists(zip_file):
                self.log("❌ Error: Backup file not found")
                self.logger.error(f"Backup file not found: {zip_file}")
                return

            # Create compression manager
            compression_manager = CompressionManager(logger=None)
            
            # Validate archive integrity first
            self.update_progress(10, "Validating backup file...")
            if not compression_manager.validate_archive(zip_file):
                self.log("❌ Error: Backup file is corrupted or invalid")
                return
            
            self.log("✅ Backup file validation successful")
            
            # Preview backup contents (optional logging)
            contents = compression_manager.list_archive_contents(zip_file)
            if contents:
                self.log(f"📋 Backup contains {len(contents)} files")
            
            # Setup paths
            wow_version = self.wow_version.get()
            wow_base_dir = self.wow_base_dir.get()
            interface_dir = os.path.join(wow_base_dir, wow_version, "Interface")
            wtf_dir = os.path.join(wow_base_dir, wow_version, "WTF")
            
            # Create temporary extraction directory
            temp_base_dir = self.temp_base_dir.get()
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_dir = os.path.join(temp_base_dir, f"restore_{timestamp}")
            
            self.update_progress(20, "Extracting backup...")
            
            # Extract backup using compression manager
            def progress_callback(value, status):
                # Map compression manager progress to our overall progress (20-70%)
                if value >= 20:  # Only process valid progress values
                    mapped_progress = 20 + ((value - 20) / 70) * 50
                    self.update_progress(mapped_progress, status)
            
            success = compression_manager.decompress_archive(zip_file, temp_dir, progress_callback)
            
            if not success:
                self.log("❌ Error: Failed to extract backup")
                return
                
            # Verify required directories exist in backup
            temp_interface = os.path.join(temp_dir, "Interface")
            temp_wtf = os.path.join(temp_dir, "WTF")
            
            if not os.path.exists(temp_interface) or not os.path.exists(temp_wtf):
                self.log("❌ Error: Invalid backup - missing Interface or WTF directories")
                return
                
            self.log("✅ Backup extraction completed successfully")
            
            # Restore Interface directory
            self.update_progress(75, "Restoring Interface directory...")
            self._restore_directory(temp_interface, interface_dir, "Interface")
            
            # Restore WTF directory  
            self.update_progress(85, "Restoring WTF directory...")
            self._restore_directory(temp_wtf, wtf_dir, "WTF")
            
            # Cleanup
            self.update_progress(95, "Cleaning up...")
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            self.log("🧹 Temporary files cleaned up")
            
            self.update_progress(100, "Restore completed successfully!")
            self.log("🎉 Restore completed successfully!")
            self.logger.info("Restore operation completed successfully")
            
        except Exception as e:
            self.log(f"❌ Error during restore: {str(e)}")
            self.logger.error(f"Restore operation failed: {str(e)}")
            self.update_progress(0, "Restore failed")
        finally:
            self.root.config(cursor="")

    def _restore_directory(self, source_dir, dest_dir, dir_name):
        """Restore a directory using the fastest available method"""
        try:
            # Remove existing directory if it exists
            if os.path.exists(dest_dir):
                self.log(f"🗑️ Removing existing {dir_name} directory...")
                if platform.system() == 'Windows':
                    # Use Windows rmdir for speed - hide console window
                    subprocess_kwargs = self._get_hidden_subprocess_kwargs()
                    
                    cmd = ['cmd', '/c', 'rmdir', '/s', '/q', dest_dir]
                    subprocess.run(cmd, capture_output=True, **subprocess_kwargs)
                else:
                    shutil.rmtree(dest_dir)
            
            # Copy using fastest method available
            if platform.system() == 'Windows':
                # Use robocopy for maximum speed on Windows - hide console window
                subprocess_kwargs = self._get_hidden_subprocess_kwargs()
                
                cmd = ['robocopy', source_dir, dest_dir, '/NFL', '/MIR', '/MT:32', '/NJH']
                result = subprocess.run(cmd, capture_output=True, text=True, **subprocess_kwargs)
                if result.returncode >= 8:  # robocopy exit codes >= 8 indicate errors
                    raise Exception(f"Robocopy failed: {result.stderr}")
            else:
                # Use shutil for other platforms
                shutil.copytree(source_dir, dest_dir)
            
            self.log(f"✅ {dir_name} directory restored successfully")
            
        except Exception as e:
            self.log(f"❌ Error restoring {dir_name}: {e}")
            raise  # Re-raise to stop the restore process

    def clear_log(self):
        self.log_text.delete(1.0, tk.END)

    # Scheduler Methods
    def start_scheduler(self):
        """Start the background scheduler thread"""
        if not self.scheduler_thread or not self.scheduler_thread.is_alive():
            self.scheduler_running = True
            self.scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
            self.scheduler_thread.start()
            self.update_scheduler()

    def stop_scheduler(self):
        """Stop the background scheduler"""
        self.scheduler_running = False
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=1)

    def _scheduler_loop(self):
        """Background scheduler loop"""
        scheduled_backups = {}
        
        while self.scheduler_running:
            try:
                current_time = datetime.now()
                
                # Check if scheduler is enabled
                if self.enable_scheduler.get():
                    # Calculate next backup time
                    interval = self.schedule_interval.get()
                    unit = self.schedule_unit.get()
                    
                    # Create unique key for current settings
                    settings_key = f"{interval}_{unit}"
                    
                    if settings_key not in scheduled_backups:
                        # Schedule first backup
                        if unit == "minutes":
                            next_backup = current_time + timedelta(minutes=interval)
                        elif unit == "hours":
                            next_backup = current_time + timedelta(hours=interval)
                        else:  # days
                            next_backup = current_time + timedelta(days=interval)
                        
                        scheduled_backups[settings_key] = next_backup
                        self.update_scheduler_status(f"Next backup: {next_backup.strftime('%Y-%m-%d %H:%M')}")
                    
                    # Check if it's time for backup
                    if current_time >= scheduled_backups[settings_key]:
                        self.log("🕒 Scheduled backup starting...")
                        self.scheduled_backup()
                        
                        # Schedule next backup
                        if unit == "minutes":
                            scheduled_backups[settings_key] = current_time + timedelta(minutes=interval)
                        elif unit == "hours":
                            scheduled_backups[settings_key] = current_time + timedelta(hours=interval)
                        else:  # days
                            scheduled_backups[settings_key] = current_time + timedelta(days=interval)
                        
                        self.update_scheduler_status(f"Next backup: {scheduled_backups[settings_key].strftime('%Y-%m-%d %H:%M')}")
                else:
                    # Clear scheduled backups when disabled
                    scheduled_backups.clear()
                    self.update_scheduler_status("")
                
                time.sleep(60)  # Check every minute
                
            except Exception as e:
                self.log(f"Scheduler error: {e}")
                time.sleep(60)

    def scheduled_backup(self):
        """Run backup in background thread"""
        backup_thread = threading.Thread(target=self._backup_operation, daemon=True)
        backup_thread.start()

    def update_scheduler(self):
        """Update scheduler based on current settings"""
        if hasattr(self, 'scheduler_status'):
            if self.enable_scheduler.get():
                interval = self.schedule_interval.get()
                unit = self.schedule_unit.get()
                self.update_scheduler_status(f"Scheduler enabled: every {interval} {unit}")
            else:
                self.update_scheduler_status("")

    def update_scheduler_status(self, message):
        """Update scheduler status in GUI thread-safe way"""
        if hasattr(self, 'scheduler_status'):
            self.root.after(0, lambda: self.scheduler_status.config(text=message))

    def toggle_scheduler(self):
        """Toggle scheduler on/off"""
        self.update_scheduler()
        
        # Start or stop background service
        if self.enable_scheduler.get():
            self.start_background_service()
        else:
            self.stop_background_service()

    def setup_tray(self):
        """Setup system tray icon"""
        if not TRAY_AVAILABLE:
            self.tray_icon = None
            return
        
        # Create a simple icon
        image = self.create_tray_icon()
        
        # Create menu
        menu = pystray.Menu(
            pystray.MenuItem("Show WowAddonSync", self.show_window, default=True),
            pystray.MenuItem("Run Backup Now", self.run_backup_now),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Exit", self.quit_app)
        )
        
        # Create tray icon
        self.tray_icon = pystray.Icon("WowAddonSync", image, "WowAddonSync", menu)
        
        # Handle window close event
        self.root.protocol("WM_DELETE_WINDOW", self.on_window_close)

    def create_tray_icon(self):
        """Create a simple tray icon image"""
        image = Image.new('RGB', (32, 32), color='#3498db')
        draw = ImageDraw.Draw(image)
        
        # Draw a simple "W" 
        try:
            # Try to use a basic font
            draw.text((8, 4), "W", fill='white')
        except:
            # Fallback - draw a simple square
            draw.rectangle([8, 8, 24, 24], fill='white')
        
        return image

    def run_backup_now(self, icon=None, item=None):
        """Run backup from tray menu"""
        self.root.after(0, self.run_backup)

    def on_window_close(self):
        """Handle window close - minimize to tray instead of closing"""
        if TRAY_AVAILABLE and self.tray_icon:
            self.minimize_to_tray()
        else:
            self.quit_app()

    def minimize_to_tray(self):
        """Minimize window to system tray"""
        if TRAY_AVAILABLE and self.tray_icon:
            self.root.withdraw()  # Hide window
            self.minimized_to_tray = True
        else:
            self.root.iconify()  # Fallback to taskbar minimize

    def show_window(self, icon=None, item=None):
        """Show the main window"""
        self.root.after(0, self._show_window)

    def _show_window(self):
        """Show window in main thread"""
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()
        self.minimized_to_tray = False

    def hide_to_tray(self):
        """Hide window - to tray if available, otherwise to taskbar"""
        if TRAY_AVAILABLE and self.tray_icon:
            self.minimize_to_tray()
            self.log("📱 Minimized to system tray - background service continues running")
        else:
            self.root.iconify()
            self.minimized_to_tray = True
            self.log("🔽 Minimized to taskbar - background service continues running")
            self.log("🔽 Minimized to taskbar - background service continues running")

    def start_background_service(self):
        """Start the background service for scheduling"""
        if self.enable_scheduler.get() and not self.service_process:
            try:
                # Get hidden subprocess arguments
                subprocess_kwargs = self._get_hidden_subprocess_kwargs()
                
                # Start service.py as separate process
                self.service_process = subprocess.Popen([
                    'python', 'service.py'
                ], cwd=os.getcwd(), 
                   stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL,
                   **subprocess_kwargs)
                   
                self.log("🚀 Background scheduler service started")
                self.logger.info("Background scheduler service started")
                
                # Start monitoring service logs
                self.start_log_monitoring()
                
            except Exception as e:
                self.log(f"Failed to start background service: {e}")
                self.logger.error(f"Failed to start background service: {str(e)}")

    def stop_background_service(self):
        """Stop the background service"""
        if self.service_process:
            try:
                self.service_process.terminate()
                self.service_process.wait(timeout=5)
                self.log("⏹️ Background scheduler service stopped")
                self.logger.info("Background scheduler service stopped")
            except:
                try:
                    self.service_process.kill()
                    self.logger.warning("Background service had to be forcefully killed")
                except:
                    pass
            finally:
                self.service_process = None
                
        # Stop log monitoring
        self.stop_log_monitoring()

    def quit_app(self, icon=None, item=None):
        """Quit from tray menu"""
        if self.tray_icon and TRAY_AVAILABLE:
            self.tray_icon.stop()
        self.root.after(0, self.quit_application)

    def quit_application(self, icon=None, item=None):
        """Quit the entire application"""
        self.logger.info("Application shutdown initiated")
        self.stop_background_service()
        self.root.quit()

    def on_closing(self):
        """Handle window close button"""
        if self.enable_scheduler.get():
            # Ask user if they want to minimize or exit
            result = messagebox.askyesnocancel(
                "Close Application", 
                "Scheduler is enabled. Would you like to:\n\n"
                "• Yes: Minimize to taskbar (background service keeps running)\n"
                "• No: Exit completely (scheduler stops)\n"
                "• Cancel: Keep window open"
            )
            
            if result is True:  # Yes - minimize
                self.hide_to_tray()
            elif result is False:  # No - exit completely
                self.quit_application()
            # Cancel - do nothing, keep window open
        else:
            # No scheduler, just exit
            self.quit_application()

if __name__ == "__main__":
    root = tk.Tk()
    app = WoWBackupApp(root)
    root.mainloop()
