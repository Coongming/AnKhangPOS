#!/bin/bash
set -e

echo "=========================================="
echo "     AnKhangPOS - Update Local App"
echo "=========================================="
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect: macOS+OrbStack or direct Linux
if [[ "$SCRIPT_DIR" == *"/OrbStack/ubuntu/"* ]]; then
    UBUNTU_WD="${SCRIPT_DIR#*/OrbStack/ubuntu}"
    RUN="orb run -m ubuntu -w $UBUNTU_WD"
    echo "     (Mode: macOS + OrbStack → Ubuntu path: $UBUNTU_WD)"
else
    RUN=""
    echo "     (Mode: Linux trực tiếp)"
fi
echo

# ===== 1. Pull code =====
echo "[1/5] Pull code mới từ GitHub..."

OLD_LOCK_HASH=""
if [ -f "$SCRIPT_DIR/package-lock.json" ]; then
    OLD_LOCK_HASH=$(shasum -a 256 "$SCRIPT_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || md5sum "$SCRIPT_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1)
fi

cd "$SCRIPT_DIR"
git fetch origin
git reset --hard origin/main
echo "     [OK] Code đã cập nhật."

# ===== 2. Write .env =====
echo
echo "[2/5] Tạo file .env trỏ về database local..."
cat > "$SCRIPT_DIR/.env" << 'ENVEOF'
# PostgreSQL Local (OrbStack Ubuntu)
LOCAL_DATABASE_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
DATABASE_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"

# Direct URL (same as DATABASE_URL for local - no pooler needed)
LOCAL_DIRECT_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"
DIRECT_URL="postgresql://ankhang:ankhang123@localhost:5432/ankhangpos"

# Auth (tài khoản đăng nhập admin)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ankhang123
AUTH_SECRET=k8Xp2mQ7vR9sT4wJ6yN1bF3dH5gL0cA8eU2iO4aZ7xK9nM1pS3qW5rY7tV0uB6f

# DeepSeek AI (Chatbot trợ lý kiểm kho)
DEEPSEEK_API_KEY=sk-13f0d54ccd5248ccb9abd170b8f181a1

# Supabase Cloud (đồng bộ dữ liệu)
SUPABASE_DIRECT_URL="postgresql://postgres.mknoguoyuszjyjyvhqls:p0QKnGrxHpx66lla@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
SUPABASE_DATABASE_URL="postgresql://postgres.mknoguoyuszjyjyvhqls:p0QKnGrxHpx66lla@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENVEOF
echo "     [OK] .env đã tạo."

# ===== 3. Dependencies =====
echo
echo "[3/5] Kiểm tra dependencies..."

NEW_LOCK_HASH=""
if [ -f "$SCRIPT_DIR/package-lock.json" ]; then
    NEW_LOCK_HASH=$(shasum -a 256 "$SCRIPT_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || md5sum "$SCRIPT_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1)
fi

NEED_INSTALL=0
[ ! -d "$SCRIPT_DIR/node_modules" ] && NEED_INSTALL=1
[ -z "$OLD_LOCK_HASH" ] && NEED_INSTALL=1
[ "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" ] && NEED_INSTALL=1

if [ "$NEED_INSTALL" = "1" ]; then
    echo "     Đang cài đặt..."
    $RUN npm install
    echo "     [OK] Dependencies đã cập nhật."
else
    echo "     [OK] Không đổi, bỏ qua."
fi

# ===== 4. Update database =====
echo
echo "[4/5] Cập nhật cấu trúc database..."
$RUN npx prisma db push --accept-data-loss
echo "     [OK] Database đã cập nhật."

# ===== 5. Build & Run =====
echo
echo "[5/5] Build và chạy app..."
$RUN npm run build

echo
echo "=========================================="
echo "  THÀNH CÔNG!"
echo "  App đang chạy tại: http://localhost:3000"
echo "  Nhấn Ctrl+C để dừng app."
echo "=========================================="
echo

# Open browser (macOS only)
if command -v open &>/dev/null; then
    (sleep 3 && open "http://localhost:3000") &
fi

$RUN npm run start
