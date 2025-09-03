<#
Simple build script for Windows (PowerShell).

Usage:
  .\build.ps1            # default: one-file build
  .\build.ps1 -OneFile:$false  # produce onedir build (faster for debugging)

This script checks for Python, creates a virtual env at .venv, installs requirements
and PyInstaller, then runs PyInstaller including 7z.exe and azure.tcl as bundled data.
If Python is not installed this script will exit with an error message.
#>

param(
    [switch]$OneFile = $true,
    [string]$Name = "WowAddonSync"
)

# Ensure running from repo root
Set-Location -Path (Get-Location)

# Verify python is available
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Write-Error "Python was not found. Install Python 3.8+ and enable 'Add to PATH', then re-run this script."
    exit 1
}

Write-Output "Using: $(python --version)"

# Create virtualenv if missing
if (-not (Test-Path '.venv')) {
    Write-Output "Creating virtual environment .venv..."
    python -m venv .venv
}

# Activate venv
. .\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r .\requirements.txt pyinstaller

Write-Output "Running PyInstaller..."

$pyinstallerArgs = @('--clean')
if ($OneFile) { $pyinstallerArgs += '--onefile'; $pyinstallerArgs += '--noconsole' } else { $pyinstallerArgs += '--noconsole' }
$pyinstallerArgs += '--name'; $pyinstallerArgs += $Name
$pyinstallerArgs += '--add-data'; $pyinstallerArgs += '7z.exe;.'
$pyinstallerArgs += '--add-data'; $pyinstallerArgs += 'azure.tcl;.'
# Add hidden imports for system tray functionality
$pyinstallerArgs += '--hidden-import'; $pyinstallerArgs += 'pystray._win32'
$pyinstallerArgs += '--hidden-import'; $pyinstallerArgs += 'PIL._tkinter_finder'
$pyinstallerArgs += '.\WowAddonSync.py'

Write-Output "pyinstaller $($pyinstallerArgs -join ' ')"
& pyinstaller @pyinstallerArgs

if (Test-Path ".\dist\$Name.exe") { Write-Output "Built: .\dist\$Name.exe" }
elseif (Test-Path ".\dist\$Name\$Name.exe") { Write-Output "Built: .\dist\$Name\$Name.exe" }
else { Write-Error "Build finished but exe not found in dist/. Check PyInstaller output above." }
