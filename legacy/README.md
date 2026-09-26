# KIYOVN Enterprise Platform

Hệ sinh thái quản trị doanh nghiệp toàn diện với kiến trúc phân tách rõ ràng giữa **Backend API** và **Frontend Web**.

---

## 📁 Cấu trúc thư mục

```
├── api/                  # Backend REST API (Node.js HTTP Server, SQLite/PostgreSQL)
│   ├── index.mjs         # Entry point & API routes (/api/v1)
│   ├── db.mjs            # Database engine (Dual-database: SQLite / PostgreSQL)
│   ├── crypto.mjs        # AES-256-CBC, Blind Indexing & Passwords
│   ├── logger.mjs        # Structured logging
│   ├── serializers.mjs   # Data masking & sanitization
│   ├── scripts/          # Database migrations & utilities
│   ├── Dockerfile        # Container build cho API
│   ├── package.json      # Backend dependencies (pg, puppeteer)
│   └── .env.example      # Cấu hình môi trường API
│
├── web/                  # Frontend Web Application (React 18, Vite, TypeScript)
│   ├── src/              # React components, custom-ui, document engine, eKYC
│   ├── public/           # Static assets
│   ├── index.html        # Entry HTML
│   ├── vite.config.ts    # Vite config with API proxy
│   ├── tailwind.config.js# Tailwind CSS styling
│   ├── nginx.conf        # Production Nginx reverse proxy
│   ├── Dockerfile        # Container build cho Frontend
│   ├── package.json      # Frontend dependencies
│   └── .env.example      # Cấu hình môi trường Web (VITE_API_URL)
│
├── docs/                 # Tài liệu kỹ thuật chuyên sâu
├── docker-compose.yml    # Docker Compose chạy đồng bộ Postgres + API + Web
└── README.md
```

---

## 🚀 Hướng dẫn khởi chạy

### 1. Khởi chạy độc lập bằng Node.js & Vite (Development)

#### Backend API:
```bash
cd api
npm install
cp .env.example .env
npm run dev
# API server lắng nghe tại http://localhost:3001
```

#### Frontend Web:
```bash
cd web
npm install
cp .env.example .env
npm run dev
# Web app chạy tại http://localhost:3011
```

---

### 2. Khởi chạy toàn bộ hệ thống bằng Docker Compose (Production / Staging)

Tại thư mục gốc:
```bash
docker compose up -d --build
```
- **PostgreSQL**: `localhost:5432`
- **Backend API**: `localhost:3001`
- **Frontend Web**: `localhost:8080` (truy cập trình duyệt tại `http://localhost:8080`)
