@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title AnKhangPOS - Update

echo ==========================================
echo      AnKhangPOS - Update Local App
echo ==========================================
echo.

REM ===== 1. Pull code =====
echo [1/5] Pull code moi tu GitHub...

set "OLD_LOCK_HASH="
if exist "package-lock.json" (
    for /f "skip=1 tokens=* delims=" %%H in ('certutil -hashfile package-lock.json SHA256 2^>nul ^| findstr /v /i "CertUtil"') do (
        if not defined OLD_LOCK_HASH set "OLD_LOCK_HASH=%%H"
    )
)

git fetch origin >nul 2>&1
if errorlevel 1 (
    echo      [LOI] Khong ket noi duoc GitHub.
    pause
    exit /b 1
)
git reset --hard origin/main >nul 2>&1
echo      [OK] Code da cap nhat.

REM ===== 2. Write .env =====
echo.
echo [2/5] Tao file .env tro ve database local...
(
echo # PostgreSQL Local
echo LOCAL_DATABASE_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
echo DATABASE_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
echo.
echo # Direct URL
echo LOCAL_DIRECT_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
echo DIRECT_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
echo.
echo # Auth
echo ADMIN_USERNAME=admin
echo ADMIN_PASSWORD=ankhang123
echo AUTH_SECRET=k8Xp2mQ7vR9sT4wJ6yN1bF3dH5gL0cA8eU2iO4aZ7xK9nM1pS3qW5rY7tV0uB6f
echo.
echo # DeepSeek AI
echo DEEPSEEK_API_KEY=sk-13f0d54ccd5248ccb9abd170b8f181a1
echo.
echo # Supabase Cloud
echo SUPABASE_DIRECT_URL="postgresql://postgres.mknoguoyuszjyjyvhqls:p0QKnGrxHpx66lla@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
echo SUPABASE_DATABASE_URL="postgresql://postgres.mknoguoyuszjyjyvhqls:p0QKnGrxHpx66lla@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
) > .env
echo      [OK] .env da tao.

REM ===== 3. Dependencies =====
echo.
echo [3/5] Kiem tra dependencies...

set "NEW_LOCK_HASH="
if exist "package-lock.json" (
    for /f "skip=1 tokens=* delims=" %%H in ('certutil -hashfile package-lock.json SHA256 2^>nul ^| findstr /v /i "CertUtil"') do (
        if not defined NEW_LOCK_HASH set "NEW_LOCK_HASH=%%H"
    )
)

set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"
if "!OLD_LOCK_HASH!"=="" set "NEED_INSTALL=1"
if not "!OLD_LOCK_HASH!"=="!NEW_LOCK_HASH!" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" (
    echo      Dang cai dat...
    call npm install
    if errorlevel 1 (
        echo      [LOI] npm install that bai.
        pause
        exit /b 1
    )
    echo      [OK] Dependencies da cap nhat.
) else (
    echo      [OK] Khong doi, bo qua.
)

REM ===== 4. Update database =====
echo.
echo [4/5] Cap nhat cau truc database...
call npx prisma db push --accept-data-loss
if errorlevel 1 (
    echo      [LOI] Cap nhat database that bai. Kiem tra PostgreSQL dang chay chua.
    pause
    exit /b 1
)
echo      [OK] Database da cap nhat.

REM ===== 5. Build & Run =====
echo.
echo [5/5] Build va chay app...
call npm run build
if errorlevel 1 (
    echo      [LOI] Build that bai.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   THANH CONG!
echo   App dang chay tai: http://localhost:3000
echo   Nhan Ctrl+C de dung app.
echo ==========================================
echo.

timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
call npm run start
pause
