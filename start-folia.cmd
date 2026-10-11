@echo off
rem start-folia.cmd
rem One-click dev launcher for this Folia clone: Vite dev server + Electron shell.
rem Run it from anywhere: it cd\'s to the repository root (%~dp0) first.
rem Double-click to run; close the window or press Ctrl+C to stop both processes.
rem Run "start-folia.cmd --check" to only verify/prepare the environment, without launching.
setlocal
cd /d "%~dp0"
title Folia dev

where node >nul 2>nul
if errorlevel 1 (
    echo [Folia] Node.js 24 or newer is required. Install Node.js and retry.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
    echo [Folia] Node.js 20 or newer is required ^(found %NODE_MAJOR%^). Upgrade Node.js and retry.
    pause
    exit /b 1
)
if %NODE_MAJOR% LSS 24 (
    echo [Folia] Recommended Node.js 24+ ^(found %NODE_MAJOR%^), proceeding with caution...
)

rem Dependencies: a fresh clone (or an interrupted install) leaves node_modules incomplete.
if not exist "node_modules\vite\package.json" (
    echo [Folia] Dependencies missing; running npm install ...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [Folia] npm install failed.
        pause
        exit /b 1
    )
)

rem Local env: .env.local is gitignored, so a fresh clone only has the template.
if not exist ".env.local" if exist ".env.example" (
    echo [Folia] Creating .env.local from .env.example ...
    copy /y ".env.example" ".env.local" >nul
)

rem Electron binary: npm install here ran with ELECTRON_SKIP_BINARY_DOWNLOAD=1, so repair it.
rem npmmirror CDN first (GitHub Releases is flaky behind the local TLS proxy).
if not exist "node_modules\electron\dist\electron.exe" (
    echo [Folia] Electron binary missing; downloading via npmmirror ...
    set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
    node "node_modules\electron\install.js"
    if errorlevel 1 (
        echo [Folia] npmmirror download failed; retrying against GitHub Releases ...
        set "ELECTRON_MIRROR="
        node "node_modules\electron\install.js"
        if errorlevel 1 (
            echo [Folia] Failed to install the Electron binary.
            pause
            exit /b 1
        )
    )
)

rem --- Integrity-label guard --------------------------------------------------
rem Windows marks a folder with a "Low" mandatory integrity label (sandboxes, some
rem antivirus/EDR tools, "downloaded from the Internet" leftovers). Chromium aborts
rem with EXCEPTION_BREAKPOINT (exit code 0x80000003 / 2147483651) before any app code
rem runs when its .exe files carry that label, so Electron dies instantly.
rem Detect it and raise the tree back to Medium, then continue normally.
call :fix_low_label "%CD%."
call :fix_low_label "node_modules\electron\dist\electron.exe"
if defined FOLIA_LABEL_LOW echo [Folia] Integrity label repaired for this folder tree.

rem Mod loader self-check: only present in builds that ship scripts/mod-startup-check.cjs.
if exist "scripts\mod-startup-check.cjs" (
    echo [Folia] Verifying mod loader...
    node "scripts\mod-startup-check.cjs"
    if errorlevel 1 (
        echo.
        echo [Folia] Mod verification failed completely. Continuing without mods...
    )
)

if /i "%~1"=="--check" (
    echo [Folia] Environment checks passed. Launch with a plain "start-folia.cmd".
    endlocal & exit /b 0
)

echo [Folia] Starting dev server and Electron shell...
call npm run dev:electron
if errorlevel 1 (
    echo.
    echo [Folia] Process exited with an error.
    echo [Folia] If the Electron window closed instantly: a "Low" integrity label on this
    echo [Folia] folder makes Chromium abort with 0x80000003. Repair it with
    echo [Folia]   icacls "%CD%" /setintegritylevel (OI)(CI)Medium /T /C /Q
    pause
)
endlocal
exit /b 0

:fix_low_label
rem %~1 = file or folder to inspect; raises a "Low" integrity label back to Medium.
set "FOLIA_LABEL_LOW="
for /f "delims=" %%L in ('icacls "%~1" 2^>nul') do (
    echo %%L | findstr /i /c:"Low Mandatory Level" >nul && set "FOLIA_LABEL_LOW=1"
)
if not defined FOLIA_LABEL_LOW exit /b 0
echo [Folia] Low integrity label detected: %~1
echo [Folia] Raising it to Medium so Chromium/Electron can start ...
icacls "%~1" /setintegritylevel (OI)(CI)Medium /T /C /Q >nul
exit /b 0
