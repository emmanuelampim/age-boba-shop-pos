@echo off
rem ============================================================
rem  AGE BOBA SHOP POS - hardware information collector
rem  Doubles-click this on the Windows 7 machine. It writes
rem  HARDWARE-INFO.txt onto the Desktop. Copy that file back.
rem ============================================================
title AGE BOBA SHOP - hardware information collector
set "OUT=%USERPROFILE%\Desktop\HARDWARE-INFO.txt"
if exist "%OUT%" del "%OUT%"

echo AGE BOBA SHOP POS - hardware information> "%OUT%"
echo Collected on: %DATE% %TIME%>> "%OUT%"
echo Machine: %COMPUTERNAME%>> "%OUT%"
echo.>> "%OUT%"

echo === 1. Windows edition, service pack, 32/64-bit ===>> "%OUT%"
wmic os get Caption,Version,OSArchitecture,ServicePackMajorVersion /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 2. Confirm 32-bit ===>> "%OUT%"
echo Processor architecture: %PROCESSOR_ARCHITECTURE% (x86 = 32-bit, AMD64 = 64-bit)>> "%OUT%"

echo.>> "%OUT%"
echo === 3. CPU model ===>> "%OUT%"
wmic cpu get Name /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 4. Memory (RAM) ===>> "%OUT%"
wmic ComputerSystem get TotalPhysicalMemory /value>> "%OUT%" 2>&1
wmic OS get FreePhysicalMemory /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 5. Drives and free space ===>> "%OUT%"
wmic LogicalDisk get DeviceID,Size,FreeSpace /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 6. Graphics card / display resolutions ===>> "%OUT%"
wmic path Win32_VideoController get Name,CurrentHorizontalResolution,CurrentVerticalResolution /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 7. Receipt printer ===>> "%OUT%"
wmic printer get Name,PortName,Default /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 8. Web browsers installed ===>> "%OUT%"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" echo Google Chrome: INSTALLED>> "%OUT%"
if exist "%ProgramFiles%\Internet Explorer\iexplore.exe" echo Internet Explorer: INSTALLED>> "%OUT%"
if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" echo Firefox: INSTALLED>> "%OUT%"

echo.>> "%OUT%"
echo === 9. Node.js and Python (only if installed) ===>> "%OUT%"
where node >nul 2>&1 && node -v >> "%OUT%" 2>&1 || echo Node.js: NOT FOUND>> "%OUT%"
where python >nul 2>&1 && python -V >> "%OUT%" 2>&1 || echo Python: NOT FOUND>> "%OUT%"

echo.>> "%OUT%"
echo === 10. USB controllers (ports present) ===>> "%OUT%"
wmic path Win32_USBController get Name /value>> "%OUT%" 2>&1

echo.>> "%OUT%"
echo === 11. Locale, time zone, date/time format ===>> "%OUT%"
wmic timezone get Caption /value>> "%OUT%" 2>&1
systeminfo | findstr /C:"System Locale" /C:"Input Locale">> "%OUT%" 2>&1
echo Current date/time display: %DATE% %TIME%>> "%OUT%"

echo.>> "%OUT%"
echo === 12. Four quick questions for the shop (please answer) ===>> "%OUT%"
echo   A) Which is the CASHIER screen and which is the CUSTOMER screen (left/right or A/B)?>> "%OUT%"
echo   B) Does this PC have internet access right now? (Yes/No)>> "%OUT%"
echo   C) What is plugged into each USB port? (printer, mouse, keyboard, flash drive)>> "%OUT%"
echo   D) Is the cash register area normally near a wall power outlet? (Yes/No)>> "%OUT%"

echo.
echo Done. Your results were saved to:
echo   %OUT%
echo Copy that HARDWARE-INFO.txt file back (USB drive is fine).
pause