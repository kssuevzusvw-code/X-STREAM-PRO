@echo off
TITLE X-STREAM + HANIME LAN SERVER
COLOR 0B

echo =======================================================
echo   X-STREAM PORTABLE LAN SERVER (v3.5.0)
echo   Local Gateway ^& Media Integration
echo =======================================================
echo [INFO] Starting Hotspot Shield VPN...
start "" "C:\Program Files (x86)\Hotspot Shield\12.15.0\bin\hsscp.exe"

echo =======================================================

:: 1. التحقق من وجود Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Please install it from nodejs.org
    pause
    exit
)

:: 2. تثبيت كافة متطلبات السيرفر الأساسي
echo [INFO] Installing / Updating Main Web Server dependencies...
call npm install



echo.
echo =======================================================
echo   STARTING SERVERS... (Press Ctrl+C to stop)
echo =======================================================
echo.

:: --- تشغيل السيرفرات في الخلفية باستخدام start /B لضمان بقائها في نافذة واحدة ---



:: 2. سيرفر الفيديو الذكي (المشغل المستقر - بورت 4000)
echo [2/5] Launching Video Proxy Server (Port 4000)...
if exist "vpn-proxy.js" (
    start /B node "vpn-proxy.js"
)

:: 2.5 سيرفر Hanime (بورت 57888)
echo [2.5/5] Launching Hanime Addon (Port 57888)...
if exist "hanime-stremio-main\server.js" (
    start /B node "hanime-stremio-main\server.js"
)

:: 4. تشغيل سيرفر الميديا (Python) من المسار الجديد الذي حددته
echo [4/5] Launching Media Server (Python)...
start /B python "media_server.py"

:: 5. تشغيل الموقع الرئيسي (هذا السطر يبقى في الواجهة لمراقبة العمليات)
echo [5/5] Launching Main Web Server (Port 3000)...
echo [INFO] View your site at: http://localhost:3000
echo.

if exist "server.js" (
    node server.js
) else (
    echo [ERROR] server.js not found!
    pause
)

pause