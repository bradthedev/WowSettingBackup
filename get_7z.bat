@echo off
echo Downloading 7-Zip portable for ultra-fast compression...
echo.

powershell -Command "& {try { $url = 'https://www.7-zip.org/a/7z2201-extra.7z'; $output = '7z-portable.7z'; Invoke-WebRequest -Uri $url -OutFile $output; echo 'Download complete. Extracting...'; & 'C:\Windows\System32\expand.exe' $output .\; Remove-Item $output; echo '7z.exe extracted successfully!'; } catch { echo 'Download failed. Please manually download 7z.exe from https://www.7-zip.org/'; }}"

echo.
echo If the download failed, please manually:
echo 1. Go to https://www.7-zip.org/
echo 2. Download the extra package (7zXXXX-extra.7z)
echo 3. Extract 7z.exe to this directory
echo.
pause
