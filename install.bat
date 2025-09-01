@echo off
echo Installing WoW Backup Manager...
echo.

REM Install Python dependencies
echo Installing Python dependencies...
pip install -r requirements.txt
echo.

REM Create logs directory
if not exist "logs" mkdir logs

REM Create desktop shortcut
echo Creating desktop shortcut...
powershell -Command "& {$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\WoW Backup Manager.lnk'); $Shortcut.TargetPath = '%CD%\main.py'; $Shortcut.Arguments = ''; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.IconLocation = '%CD%\main.py'; $Shortcut.Description = 'WoW Backup Manager'; $Shortcut.Save()}"

REM Create start menu shortcut
echo Creating start menu shortcut...
if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\WoW Backup Manager" mkdir "%APPDATA%\Microsoft\Windows\Start Menu\Programs\WoW Backup Manager"
powershell -Command "& {$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\WoW Backup Manager\WoW Backup Manager.lnk'); $Shortcut.TargetPath = '%CD%\main.py'; $Shortcut.Arguments = ''; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.IconLocation = '%CD%\main.py'; $Shortcut.Description = 'WoW Backup Manager'; $Shortcut.Save()}"
powershell -Command "& {$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%APPDATA%\Microsoft\Windows\Start Menu\Programs\WoW Backup Manager\Background Service.lnk'); $Shortcut.TargetPath = '%CD%\service.py'; $Shortcut.Arguments = ''; $Shortcut.WorkingDirectory = '%CD%'; $Shortcut.IconLocation = '%CD%\service.py'; $Shortcut.Description = 'WoW Backup Background Service'; $Shortcut.Save()}"

echo.
echo ✅ Installation complete!
echo.
echo You can now:
echo • Run "python main.py" for the GUI application
echo • Run "python service.py" for background service only
echo • Use the desktop shortcut to launch the GUI
echo.
echo The background service will run independently and continue
echo backing up your WoW data even when the GUI is closed.
echo.
pause
