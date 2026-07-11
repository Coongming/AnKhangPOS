@echo off
setlocal
title AnKhangPOS - Update Code
color 0E

echo ==========================================
echo      AnKhangPOS - Cap nhat code moi
echo ==========================================
echo.

REM Neu dat file .bat nay ben ngoai project thi sua PROJECT_DIR ben duoi.
REM Neu dat file .bat trong thu muc project thi giu nguyen %~dp0.
set "PROJECT_DIR=%~dp0.."
set "REPO_URL=https://github.com/Coongming/AnKhangPOS_Local.git"
set "DB_URL=postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
    echo      [LOI] Khong vao duoc thu muc project: %PROJECT_DIR%
    pause
    exit /b 1
)

REM === Kiem tra va khoi dong PostgreSQL ===
echo [1/8] Kiem tra PostgreSQL...
sc query postgresql-16 | findstr "RUNNING" >nul 2>&1
if errorlevel 1 (
    echo      Dang khoi dong PostgreSQL...
    net start postgresql-16 >nul 2>&1
    timeout /t 3 >nul
)
echo      [OK] PostgreSQL san sang.

REM === Init git neu chua co ===
echo.
echo [2/8] Kiem tra Git...
if not exist ".git" (
    echo      Chua co Git repo. Dang khoi tao...
    git init
    git remote add origin %REPO_URL%
    git fetch origin
    git checkout -B main origin/main
    if errorlevel 1 (
        echo      [LOI] Khong the khoi tao Git repo.
        pause
        exit /b 1
    )
    echo      [OK] Da khoi tao Git repo.
) else (
    echo      [OK] Git repo da ton tai.
)

REM === Pull code moi ===
echo.
echo [3/8] Pull code moi tu GitHub...
git fetch origin
git reset --hard origin/main
if errorlevel 1 (
    echo      [LOI] Khong the pull code! Kiem tra ket noi mang.
    pause
    exit /b 1
)
echo      [OK] Da cap nhat code moi nhat.

REM === Ghi .env local ===
echo.
echo [4/8] Cau hinh database local...
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

REM File .env.online la tuy chon, de rieng tren may B:
REM SUPABASE_DIRECT_URL="postgresql://..."
REM SUPABASE_DATABASE_URL="postgresql://..."
if exist ".env.online" (
    echo.>> .env
    type ".env.online" >> .env
    echo      [OK] Da nap them cau hinh online tu .env.online.
) else (
    echo      [CANH BAO] Chua co .env.online, chuc nang sync online se chua dung duoc.
)
echo      [OK] Da cau hinh .env cho database local.

REM === Cai dependencies ===
echo.
echo [5/8] Cai dat dependencies...
call npm install
if errorlevel 1 (
    echo      [LOI] npm install that bai!
    pause
    exit /b 1
)
echo      [OK] Dependencies da cai xong.

REM === Update database local ===
echo.
echo [6/8] Cap nhat database local...
call npm run db:update
if errorlevel 1 (
    echo      [LOI] Cap nhat database that bai!
    pause
    exit /b 1
)
echo      [OK] Database local da cap nhat.

REM === Build app ===
echo.
echo [7/8] Build app...
echo      Dang build... Co the mat 1-2 phut.
call npm run build
if errorlevel 1 (
    echo      [LOI] Build that bai!
    pause
    exit /b 1
)
echo      [OK] Build thanh cong.

REM === Start app ===
echo.
echo [8/8] Khoi dong app...
echo.
echo ==========================================
echo   CAP NHAT THANH CONG!
echo   App dang chay tai: http://localhost:3000
echo   Nhan Ctrl+C de dung app
echo ==========================================
echo.
call npm run start
