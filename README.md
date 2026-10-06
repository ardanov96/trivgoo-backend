# 🌍 Trivgoo API — AI-Powered Online Travel Agent (OTA) Backend

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/MySQL-8.0%20%7C%20TiDB-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL / TiDB" />
  <img src="https://img.shields.io/badge/Knex.js-Query%20Builder-E16B36?style=for-the-badge&logo=knexdotjs&logoColor=white" alt="Knex.js" />
  <img src="https://img.shields.io/badge/Groq%20Cloud-LLaMA%203.3-F55036?style=for-the-badge" alt="Groq AI" />
  <img src="https://img.shields.io/badge/Google%20Gemini-Generative%20AI-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini AI" />
</p>

---

## 📌 Overview

**Trivgoo API** adalah backend RESTful berskala *production-ready* untuk platform **Online Travel Agent (OTA)** generasi modern. Dibangun dengan fokus pada keandalan transaksi, performa tinggi, modularitas, serta integrasi **Artificial Intelligence (AI)** untuk merencanakan liburan secara cerdas dan otomatis.

Platform ini memadukan ekosistem perjalanan menyeluruh: pemesanan paket tur, penginapan (*stay*), penyewaan armada mobil (*car rental*), penjemputan bandara, sistem keanggotaan/loyalitas bertingkat (*loyalty & tier rewards*), portal mitra/agen, hingga integrasi *dual payment gateway* (Xendit & DOKU).

---

## ✨ Fitur Utama

### 🤖 1. AI Trip Planner & Smart Itinerary Engine
* **Generasi Rencana Perjalanan Otomatis**: Memanfaatkan model LLM mutakhir (**Groq Cloud LLaMA 3.3** & **Google Gemini 2.0 Flash**) untuk mengubah preferensi cerita pengguna menjadi *itinerary* harian yang terstruktur lengkap dengan estimasi biaya, rekomendasi aktivitas, dan penyesuaian rute.
* **Smart Bundle & Scarcity Alerts**: Rekomendasi otomatis paket gabungan (*tour + transport + stay*) dengan deteksi ketersediaan kuota real-time.
* **In-Memory Intelligent Caching**: Mekanisme caching berbasis TTL (30 menit) dan *LRU eviction* untuk memangkas latensi respon dan menghemat kuota token AI.

### 🏨 2. Multi-Vertical Travel Inventory
* **Tours & Activities**: Katalog aktivitas wisata lengkap dengan foto, ulasan, koordinat GPS (lat/lng), dan detail fasilitas.
* **Accommodations (Stay)**: Manajemen hotel dan vila.
* **Car Rentals**: Manajemen 53+ varian armada kendaraan (SUV, MPV, Luxury Sedan, Medium Bus, hingga Big Bus) dengan spesifikasi kapasitas tempat duduk, tahun armada, dan ketersediaan dinamis.
* **Flash Sale & Dynamic Promo**: Pengaturan diskon kilat berbasis waktu dengan *scheduler* status otomatis.

### 👥 3. Role-Based Access Control (RBAC) & Partner Verification
* **Multi-Role System**: Pemisahan otorisasi ketat antara `ADMIN`, `AGENT` (mitra vendor), dan `CUSTOMER`.
* **Agent KYC & Document Verification**: Alur verifikasi mitra dengan upload dokumen NIB/SK dan KTP, proses review berstatus (`PENDING`, `VERIFIED`, `REJECTED`), serta audit trail perubahan rekening bank.

### 💳 4. Dual Payment Gateway & Rescheduling System
* **Xendit & DOKU Integration**: Integrasi ganda dengan payment gateway resmi Indonesia (Virtual Account, E-Wallet, QRIS, Kartu Kredit).
* **Asynchronous Webhook Processor**: Penanganan notifikasi pembayaran otomatis yang *idempotent* dan aman dengan verifikasi signature/token.
* **Rescheduling Management**: Alur pengajuan perubahan tanggal perjalanan terstruktur untuk pesanan pelanggan.

### 🎁 5. Loyalty Points, Membership Tiers & Referral Engine
* **Membership Tiers**: 4 tingkatan member (Silver, Gold, Platinum, VIP) dengan hak istimewa diskon eksklusif.
* **Gamified Points**: Poin reward dari transaksi belanja, ulasan produk, verifikasi email, dan ulang tahun.
* **Voucher Engine**: Validasi voucher dengan aturan pembatasan kuota, blacklist/whitelist kategori/produk, dan minimum transaksi.
* **Viral Referral Tracking**: Pelacakan klik referral, sistem kode undangan unik, dan pencairan reward sponsor otomatis.

---

## 🛠️ Tech Stack & Arsitektur

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v18+) | Engine JavaScript asynchronous & scalable |
| **Framework** | Express.js 4.x | REST API server dengan middleware pipeline |
| **Database** | MySQL 8.0 / TiDB Serverless | Kompatibel penuh dengan cloud-native MySQL protocol |
| **Query Builder** | Knex.js | 48 file migrasi database dan *seeders* terstruktur |
| **Session & Auth** | `express-mysql-session` | State management sesi terenkripsi yang persisten di DB |
| **AI LLM** | Groq SDK (`groq-sdk`) & Google GenAI | Pemrosesan bahasa alami berkecepatan tinggi |
| **Payment Gateway** | Xendit & DOKU SDK | Gateway pembayaran multi-metode |
| **Notifications** | Firebase Admin SDK (FCM) | Notifikasi push ke perangkat pengguna |
| **Email Service** | Nodemailer | Pengiriman token verifikasi & reset password via SMTP |
| **Security** | Helmet, CORS, Bcryptjs, Hashids | Pengamanan header HTTP, hashing password, dan masking ID |

---

## 🗄️ Struktur Database (35 Tabel)

Database dikelola secara deklaratif melalui Knex Migrations:

```
├── Core: users, user_profiles, password_resets, email_verifications
├── Products & Cars: products, categories, cars, product_vouchers, reviews
├── Booking & Transactions: bookings, payment_settings, payment_transactions, webhook_logs
├── Promo & Marketing: promo_campaigns, promo_campaign_products, promo_analytics, flash_sale_requests
├── Loyalty & Gamification: membership_tiers, user_memberships, point_balances, point_transactions, point_redemptions
├── Referrals: referral_codes, referral_usages
├── Agent Partner KYC: agent_verifications, agent_audit_logs, agent_bank_requests
└── System: settings, fcm_tokens, knex_migrations, sessions
```

---

## 🚀 Panduan Instalasi Lokal

### 1. Prasyarat
* Node.js v18 atau lebih baru
* Akun MySQL lokal atau cloud database (misal: TiDB Serverless)

### 2. Clone Repository
```bash
git clone https://github.com/ardanov96/trivgoo-backend.git
cd trivgoo-backend
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Konfigurasi Environment Variable
Salin file konfigurasi environment:
```bash
cp .env.example .env
```
Sesuaikan variabel database dan API keys di dalam `.env`:
```env
# Server
PORT=4001
NODE_ENV=development

# Database (MySQL / TiDB)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=trivgoo_development
DB_SSL=false

# Session & Security
SESSION_SECRET=your_super_secret_session_key
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# AI Service
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Payment Gateways (Sandbox)
XENDIT_SECRET_KEY=xnd_development_...
DOKU_CLIENT_ID=BRN-...
DOKU_SECRET_KEY=SK-...
```

### 5. Jalankan Database Migration & Seeders
```bash
# Jalankan migrasi seluruh tabel (48 migration files)
npm run migrate

# Masukkan data awal (Admin, Agent, Customer, Categories, 30 Products, 53 Cars, 500 Bookings)
npm run seed:user
node seeders/categorySeeder.js
npm run seed:product
node seeders/carSeeder.js
node seeders/promoSeeder.js
npx knex seed:run --specific=bookingSeeder.js --knexfile knexfile.js
```

### 6. Jalankan Server
```bash
# Mode development (dengan nodemon)
npm start

# Mode production
node index.js
```
Server akan aktif di `http://localhost:4001`.

---

## 📡 Ringkasan Endpoint Utama API

Semua endpoint diawali dengan prefix `/api/v1`:

### 🔐 Autentikasi (`/auth`)
* `POST /auth/register` — Pendaftaran pengguna baru (otomatis membuat referral code)
* `POST /auth/login` — Login berbasis cookie HTTP-only session
* `POST /auth/logout` — Menghapus sesi aktif
* `GET  /auth/me` — Mendapatkan profil pengguna yang sedang login
* `PATCH /auth/update-profile` — Memperbarui biodata dan avatar pengguna
* `POST /auth/forgot-password` & `POST /auth/reset-password` — Pemulihan kata sandi

### 🤖 AI Trip Planner (`/ai`)
* `POST /ai/itinerary` — Menghasilkan rekomendasi rencana perjalanan dinamis berbasis prompt dan filter tanggal

### 📦 Produk & Layanan (`/products`)
* `GET  /products` — Pencarian & filter katalog produk (Tour, Stay, Transport)
* `GET  /products/:id` — Detail lengkap produk beserta fasilitas dan ulasan
* `GET  /products/flash-sale` — Daftar produk yang sedang promo flash sale aktif
* `GET  /car-rental` — Katalog sewa armada mobil beserta spesifikasi

### 📅 Pemesanan (`/bookings`)
* `POST /bookings` — Membuat reservasi baru
* `GET  /bookings/my` — Riwayat pemesanan pengguna
* `GET  /bookings/:id` — Detail status dan instruksi pembayaran
* `POST /bookings/:id/reschedule` — Pengajuan perubahan tanggal aktivitas

### 💳 Pembayaran & Webhook (`/payments`)
* `POST /payments/create-invoice` — Pembuatan invoice pembayaran (Xendit / DOKU)
* `POST /payments/xendit/webhook` — Webhook handler notifikasi pembayaran Xendit
* `POST /payments/doku/webhook` — Webhook handler notifikasi pembayaran DOKU

### 🎁 Loyalitas & Voucher (`/loyalty`)
* `GET  /loyalty/my-points` — Saldo poin dan riwayat transaksi poin
* `GET  /loyalty/vouchers` — Daftar voucher promo yang tersedia
* `POST /loyalty/redeem` — Penukaran poin dengan voucher diskon
* `GET  /loyalty/referrals` — Statistik performa kode referral pengguna

---

## ☁️ Deployment Guide (100% Free Tier)

Project ini dirancang agar dapat di-host secara mandiri dan **100% gratis** untuk keperluan portfolio:

1. **Database**: [TiDB Cloud Serverless](https://tidbcloud.com) (Gratis 5 GB selamanya, tanpa sleep, region Singapore, wajibkan `DB_SSL=true`).
2. **Backend**: [Render.com](https://render.com) (Web Service gratis dengan runtime Node.js).
3. **Frontend**: [Vercel](https://vercel.com) (Menggunakan Vercel Rewrites `/api/:path*` sebagai reverse-proxy untuk bypass batasan third-party cookie).
4. **Keep-Alive**: [UptimeRobot](https://uptimerobot.com) untuk menjaga backend Render tetap aktif setiap 10 menit tanpa *cold-start*.

---

## 📄 Lisensi

Distributed under the MIT License. Dikembangkan oleh [ardanov96](https://github.com/ardanov96).
