# 🍚 AnKhang POS

**Hệ thống quản lý bán hàng** cho cửa hàng gạo & nước **An Khang** — xây dựng bằng Next.js 14, TypeScript, Prisma ORM và PostgreSQL.

> Ứng dụng thực tế đang vận hành, hỗ trợ bán hàng, nhập hàng, quản lý tồn kho, công nợ, trộn gạo, nhân viên và báo cáo doanh thu.

---

## ✨ Tính năng chính

| Chức năng | Mô tả |
| :--- | :--- |
| 🛒 **Bán hàng (POS)** | Giao diện bán hàng nhanh, chọn sản phẩm, tính tiền, in hóa đơn |
| 📦 **Nhập hàng** | Quản lý phiếu nhập từ nhà cung cấp, tự cập nhật giá vốn & tồn kho |
| 📊 **Tồn kho** | Theo dõi tồn kho theo lô, cảnh báo hàng sắp hết, sổ kho liên tục (stock ledger) |
| 🍚 **Trộn gạo** | Tạo mẫu trộn, trộn nhiều loại gạo thành sản phẩm mới, tính giá vốn tự động |
| 💰 **Công nợ** | Quản lý công nợ khách hàng & nhà cung cấp, phân bổ thanh toán theo FIFO |
| 👥 **Khách hàng** | Danh sách khách hàng, phân nhóm theo tần suất mua hàng (recency) |
| 🏭 **Nhà cung cấp** | Quản lý thông tin NCC, theo dõi công nợ phải trả |
| 👨‍💼 **Nhân viên** | Quản lý nhân viên, ca làm việc, tính lương theo giờ/giao hàng |
| 📈 **Báo cáo** | Dashboard tổng quan, doanh thu, lợi nhuận, sổ quỹ, xuất báo cáo |
| 💬 **Chatbot AI** | Trợ lý AI hỗ trợ kiểm kho và trả lời câu hỏi nghiệp vụ (DeepSeek) |
| 🔄 **Đồng bộ dữ liệu** | Đồng bộ hai chiều giữa cơ sở dữ liệu local và cloud (Supabase) |
| 💾 **Sao lưu & Khôi phục** | Backup dữ liệu dạng JSON, khôi phục khi cần |
| 🔐 **Xác thực** | Đăng nhập bảo mật, phân quyền admin/staff |

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ |
| :--- | :--- |
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router) |
| **Ngôn ngữ** | TypeScript |
| **ORM** | [Prisma 5](https://www.prisma.io/) |
| **Database** | PostgreSQL (hỗ trợ local + Supabase cloud) |
| **UI** | React 18, Vanilla CSS |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Charts** | [Recharts](https://recharts.org/) |
| **AI Chatbot** | DeepSeek API |
| **Export** | [SheetJS (xlsx)](https://sheetjs.com/) — xuất Excel |

---

## 📁 Cấu trúc dự án

```
AnKhangPOS/
├── prisma/
│   ├── schema.prisma          # Database schema (20+ models, kiểu Decimal chuẩn kế toán)
│   ├── seed.ts                # Dữ liệu mặc định
│   └── migrations/            # Lịch sử migration
├── scripts/
│   ├── update_local_database.ts        # Cập nhật schema local
│   ├── pull_online_to_local.ts         # Đồng bộ cloud → local
│   ├── rebuild_stock_from_history.ts   # Tái tạo sổ kho từ lịch sử
│   └── ...
├── src/
│   ├── app/
│   │   ├── api/               # 15+ API routes (RESTful)
│   │   ├── ban-hang/          # Trang bán hàng (POS)
│   │   ├── nhap-hang/         # Nhập hàng
│   │   ├── san-pham/          # Quản lý sản phẩm
│   │   ├── khach-hang/        # Khách hàng
│   │   ├── nha-cung-cap/      # Nhà cung cấp
│   │   ├── nhan-vien/         # Nhân viên & lương
│   │   ├── cong-no/           # Công nợ
│   │   ├── ton-kho/           # Tồn kho
│   │   ├── tron-gao/          # Trộn gạo
│   │   ├── bao-cao/           # Báo cáo (doanh thu, lợi nhuận, sổ quỹ, công nợ, tồn kho)
│   │   ├── he-thong/          # Cài đặt, backup
│   │   ├── page.tsx           # Dashboard tổng quan
│   │   └── globals.css        # Toàn bộ CSS
│   ├── components/
│   │   ├── Sidebar.tsx        # Thanh menu điều hướng
│   │   ├── InvoiceModal.tsx   # Modal in hóa đơn
│   │   ├── ChatBot.tsx        # Chatbot AI
│   │   └── Toast.tsx          # Thông báo
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton
│       ├── code-sequence.ts   # Sinh mã tự động (atomic, chống trùng)
│       ├── stock-ledger.ts    # Sổ kho liên tục
│       ├── debt-utils.ts      # Tiện ích công nợ
│       ├── stock-operations.ts # Xử lý tồn kho
│       └── utils.ts           # Format tiền, ngày, tính giá
├── tests/                     # Unit tests
├── backups/                   # Bản backup database
└── package.json
```

---

## 🚀 Cài đặt & Chạy dự án

### Yêu cầu hệ thống

- **Node.js** >= 18
- **PostgreSQL** >= 14
- **npm** hoặc **yarn**

### Bước 1: Clone dự án

```bash
git clone https://github.com/Coongming/AnKhangPOS.git
cd AnKhangPOS
```

### Bước 2: Cài đặt dependencies

```bash
npm install
```

### Bước 3: Cấu hình biến môi trường

Tạo file `.env` tại thư mục gốc:

```env
# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/ankhangpos"
DIRECT_URL="postgresql://user:password@localhost:5432/ankhangpos"

# Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
AUTH_SECRET=your_random_secret_key

# DeepSeek AI (tùy chọn - cho chatbot)
DEEPSEEK_API_KEY=your_deepseek_api_key

# Supabase Cloud (tùy chọn - cho đồng bộ online)
SUPABASE_DATABASE_URL="postgresql://..."
SUPABASE_DIRECT_URL="postgresql://..."
```

### Bước 4: Khởi tạo database

```bash
# Đẩy schema lên database
npx prisma db push

# Tạo dữ liệu mặc định (nhóm sản phẩm, danh mục chi phí, cài đặt)
npm run db:seed
```

### Bước 5: Chạy ứng dụng

```bash
# Chế độ phát triển
npm run dev

# Hoặc build & chạy production
npm run build
npm start
```

Truy cập tại: **http://localhost:3000**

---

## 📜 Scripts hữu ích

| Lệnh | Mô tả |
| :--- | :--- |
| `npm run dev` | Chạy server phát triển |
| `npm run build` | Build production |
| `npm run db:push` | Đẩy schema Prisma lên database |
| `npm run db:seed` | Tạo dữ liệu mặc định |
| `npm run db:setup` | Kết hợp `db:push` + `db:seed` |
| `npm run db:update` | Cập nhật schema local database |
| `npm run db:pull-online` | Đồng bộ dữ liệu từ cloud về local |
| `npm run stock:rebuild-ledger` | Tái tạo sổ kho từ lịch sử giao dịch |
| `npm run debt:rebuild-allocations` | Tái phân bổ thanh toán công nợ khách hàng |
| `npm run test:customer-recency` | Chạy unit tests cho tính năng phân nhóm khách hàng |

---

## 🗄️ Database Schema

Hệ thống sử dụng **PostgreSQL** với kiểu dữ liệu `Decimal(15, 0)` cho tất cả các trường tiền tệ — đảm bảo chính xác tuyệt đối, không bị sai số làm tròn.

### Các bảng chính

```
products              → Sản phẩm (gạo, nước, ...)
product_categories    → Nhóm sản phẩm
customers             → Khách hàng
suppliers             → Nhà cung cấp
sales / sale_items    → Hóa đơn bán hàng
purchases / purchase_items → Phiếu nhập hàng
debt_transactions     → Giao dịch công nợ
stock_movements       → Biến động tồn kho
blend_templates       → Mẫu trộn gạo
blend_history         → Lịch sử trộn gạo
employees             → Nhân viên
employee_shifts       → Ca làm việc
salary_payments       → Thanh toán lương
expenses              → Chi phí
expense_categories    → Danh mục chi phí
code_sequences        → Bộ đếm mã tự tăng (chống trùng)
system_settings       → Cài đặt hệ thống
users                 → Tài khoản đăng nhập
```

---

## 🔒 Bảo mật

- Mật khẩu được hash bằng **bcrypt**
- Phiên đăng nhập sử dụng **JWT** (httpOnly cookie)
- Middleware bảo vệ tất cả API routes
- Sinh mã tự động sử dụng **row-level lock** trong PostgreSQL — chống trùng mã khi nhiều người dùng đồng thời

---

## 👨‍💻 Tác giả

**Văn Đức Công Minh** ([@Coongming](https://github.com/Coongming))

---

## 📄 License

Dự án này được phát hành dưới giấy phép [MIT](LICENSE).
