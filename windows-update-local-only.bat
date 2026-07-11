@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title AnKhangPOS - Update Local App
color 0E

echo ==========================================
echo      AnKhangPOS - Update Local App
echo ==========================================
echo.

REM Sua 2 dong nay neu duong dan/project GitHub thay doi.
set "PROJECT_DIR=C:\Users\vysayhi\Desktop\AnKhangPOS_Local-main\AnKhangPOS_Local-main"
set "REPO_URL=https://github.com/Coongming/AnKhangPOS_Local.git"
set "DB_URL=postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
set "POSTGRES_SERVICE=postgresql-16"

if not exist "%PROJECT_DIR%" (
    echo Thu muc project chua ton tai, dang tao moi...
    mkdir "%PROJECT_DIR%"
)

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
    echo [LOI] Khong vao duoc thu muc project: %PROJECT_DIR%
    pause
    exit /b 1
)

echo [1/5] Kiem tra Git va pull code moi...
set "OLD_LOCK_HASH="
if exist "package-lock.json" (
    for /f "skip=1 tokens=* delims=" %%H in ('certutil -hashfile package-lock.json SHA256 ^| findstr /v /i "CertUtil"') do (
        if not defined OLD_LOCK_HASH set "OLD_LOCK_HASH=%%H"
    )
)

if not exist ".git" (
    git init
    git remote add origin "%REPO_URL%"
) else (
    git remote set-url origin "%REPO_URL%" >nul 2>&1
)

git fetch origin
if errorlevel 1 (
    echo [LOI] Khong the fetch code moi tu GitHub.
    pause
    exit /b 1
)

git checkout -B main origin/main
if errorlevel 1 (
    echo [LOI] Khong the checkout branch main.
    pause
    exit /b 1
)

git reset --hard origin/main
if errorlevel 1 (
    echo [LOI] Khong the cap nhat code moi.
    pause
    exit /b 1
)
echo      [OK] Code da cap nhat.

echo.
echo [2/5] Ghi file .env local...
(
    echo # PostgreSQL Local
    echo DATABASE_URL="%DB_URL%"
    echo DIRECT_URL="%DB_URL%"
    echo.
    echo # Auth
    echo ADMIN_USERNAME=admin
    echo ADMIN_PASSWORD=ankhang123
    echo AUTH_SECRET=k8Xp2mQ7vR9sT4wJ6yN1bF3dH5gL0cA8eU2iO4aZ7xK9nM1pS3qW5rY7tV0uB6f
) > .env
echo      [OK] .env da tro ve database local.

echo.
echo [3/5] Cai dependencies neu can...
set "NEW_LOCK_HASH="
if exist "package-lock.json" (
    for /f "skip=1 tokens=* delims=" %%H in ('certutil -hashfile package-lock.json SHA256 ^| findstr /v /i "CertUtil"') do (
        if not defined NEW_LOCK_HASH set "NEW_LOCK_HASH=%%H"
    )
)

set "NEED_NPM_INSTALL=0"
if not exist "node_modules" set "NEED_NPM_INSTALL=1"
if "!OLD_LOCK_HASH!"=="" set "NEED_NPM_INSTALL=1"
if not "!OLD_LOCK_HASH!"=="!NEW_LOCK_HASH!" set "NEED_NPM_INSTALL=1"

if "!NEED_NPM_INSTALL!"=="1" (
    call npm install
    if errorlevel 1 (
        echo [LOI] npm install that bai.
        pause
        exit /b 1
    )
    echo      [OK] Dependencies da cai/cap nhat.
) else (
    echo      [OK] Dependencies khong doi, bo qua npm install.
)

echo.
echo [4/5] Cap nhat database local...
sc query "%POSTGRES_SERVICE%" | findstr "RUNNING" >nul 2>&1
if errorlevel 1 (
    echo      PostgreSQL chua chay, dang khoi dong service %POSTGRES_SERVICE%...
    net start "%POSTGRES_SERVICE%" >nul 2>&1
    timeout /t 3 >nul
)

call npm run db:update
if errorlevel 1 (
    echo [LOI] Cap nhat database local that bai.
    pause
    exit /b 1
)
echo      [OK] Database local da cap nhat schema/data patch.

echo.
echo [5/5] Build va chay app...
call npm run build
if errorlevel 1 (
    echo [LOI] Build that bai.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   CAP NHAT THANH CONG!
echo   App dang chay tai: http://localhost:3000
echo   Neu can nap data, vao Sao luu va Khoi phuc de nap file JSON.
echo   Nhan Ctrl+C de dung app.
echo ==========================================
echo.
call npm run start
