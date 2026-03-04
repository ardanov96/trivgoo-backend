/**
 * Optimized Express bootstrap - Fixed Lifecycle for Production/VPS
 * Fixed: MySQL session store, cookie config per-env, CORS hardened, dotenv per-env
 */
const dotenvFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
require('dotenv').config({ path: dotenvFile });

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const routerNav = require('./src/index');

const app = express();

// --------------------
// 1. ENV & CONFIGS
// --------------------
const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_DEV = NODE_ENV === 'development';

console.log(`[ENV] Loaded: ${dotenvFile}`);
console.log(`[ENV] NODE_ENV=${NODE_ENV}, PORT=${PORT}, DB=${process.env.DB_NAME}`);

// Explicit Allowed Origins
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost',
  'https://trivgoo.com',
  'https://dev.trivgoo.com',
  'http://dev.trivgoo.com',
  ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
]);

// --------------------
// 2. GLOBAL MIDDLEWARES (Order is crucial)
// --------------------
app.set('trust proxy', 1);
app.use(morgan(IS_PROD ? 'combined' : 'dev'));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '5mb' }));
app.use(cookieParser());

// CORS Configuration
app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server requests (no origin) & known origins
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    console.warn(`[CORS BLOCKED] Origin: ${origin}`);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --------------------
// 3. SESSION (Initialize before Routes)
// --------------------
const MySQLStore = require('express-mysql-session')(session);

// Gunakan pool dari db.js agar tidak buka koneksi baru terpisah
const { pool } = require('./src/configs/db');

const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 900000, // Cleanup setiap 15 menit
  createDatabaseTable: true,       // Auto-buat tabel `sessions` jika belum ada
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
}, pool); // <- pass pool langsung, tidak perlu konfigurasi koneksi ulang

sessionStore.on('error', (err) => {
  console.error('[SESSION STORE ERROR]', err.message);
});

function getSessionMiddleware(timeoutMins = 30) {
  return session({
    name: process.env.SESSION_NAME || 'sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-trivgoo',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      // localhost (http)  -> sameSite: 'lax',  secure: false
      // dev.trivgoo.com (https) -> sameSite: 'none', secure: true
      sameSite: IS_DEV ? 'lax' : 'none',
      secure: !IS_DEV,
      maxAge: timeoutMins * 60 * 1000
    }
  });
}

// Pasang session default (30 menit)
app.use(getSessionMiddleware(30));

// --------------------
// 4. ROUTES (HARUS DI LUAR ASYNC START)
// --------------------
console.log("--- [BOOT] Registering Routes Sync ---");

const path = require('path');

// Static umum
app.use(express.static(path.join(__dirname, 'public')));

// Static khusus product images per specialization
app.use('/products/tour',      express.static(path.join(__dirname, 'public/products/tour')));
app.use('/products/stay',      express.static(path.join(__dirname, 'public/products/stay')));
app.use('/products/transport', express.static(path.join(__dirname, 'public/products/transport')));
app.use('/car-rental',         express.static(path.join(__dirname, 'public/car-rental')));

// API: no-cache header
app.use('/api', (_, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

console.log("Checking routerNav...");

// Mount Main Router
app.use('/api/v1', routerNav);

// --------------------
// 5. ERROR HANDLERS
// --------------------

// 404 handler
app.use((req, res) => {
  console.warn(`[404 NOT FOUND] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    status: 404,
    error: true,
    message: `Endpoint ${req.originalUrl} tidak ditemukan.`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    status: 500,
    error: true,
    message: IS_PROD ? 'Internal Server Error' : err.message
  });
});

// --------------------
// 6. BOOTSTRAP (DB check & Listen)
// --------------------
async function start() {
  const db = require('./src/configs/db');

  try {
    console.log("[INIT] Checking Database Connection...");
    await db.execute('SELECT 1'); // <- gunakan execute, sesuai export db.js
    console.log("✅ Database Connected.");
  } catch (err) {
    console.error("❌ [DATABASE ERROR] Gagal konek DB saat startup:", err.message);
    // Tidak exit — biarkan server tetap jalan, DB bisa reconnect
  }

  app.listen(PORT, () => {
    console.log(`\n\t*** Server listening on PORT ${PORT} (${NODE_ENV}) ***\n`);
    console.log(`\tCookie mode  : sameSite=${IS_DEV ? 'lax' : 'none'}, secure=${!IS_DEV}`);
    console.log(`\tSession store: MySQL (${process.env.DB_NAME})\n`);
  });
}

start().catch(e => console.error("[FATAL]", e));