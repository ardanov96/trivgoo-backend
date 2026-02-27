/**
 * Optimized Express bootstrap - Fixed Lifecycle for Production/VPS
 */
require('dotenv').config();
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

// Explicit Allowed Origins
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'https://trivgoo.com',
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
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// --------------------
// 3. SESSION (Initialize before Routes)
// --------------------
// Kita buat fungsi pembungkus agar timeout bisa dinamis tanpa menghalangi boot rute
function getSessionMiddleware(timeoutMins = 30) {
  return session({
    name: process.env.SESSION_NAME || 'sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-trivgoo',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: process.env.COOKIE_SAMESITE || 'lax',
      secure: IS_PROD,
      maxAge: timeoutMins * 60 * 1000
    }
  });
}

// Pasang session default agar rute langsung siap
app.use(getSessionMiddleware());

// --------------------
// 4. ROUTES (HARUS DI LUAR ASYNC START)
// --------------------
console.log("--- [BOOT] Registering Routes Sync ---");

// Static files & API No-Cache
const path = require('path');

// Static umum
app.use(express.static(path.join(__dirname, 'public')));

// Static khusus product images per specialization
app.use('/products/tour',      express.static(path.join(__dirname, 'public/products/tour')));
app.use('/products/stay',      express.static(path.join(__dirname, 'public/products/stay')));
app.use('/products/transport', express.static(path.join(__dirname, 'public/products/transport')));

app.use('/api', (_, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

console.log("Checking routerNav...");

// Mount Main Router
app.use('/api/v1', routerNav);

app.use((req, res) => {
    console.log(`[REJECTED] 404 pada: ${req.method} ${req.url}`);
    res.status(404).send('Not Found via Express Final Handler');
});

// --------------------
// 5. ERROR HANDLERS
// --------------------
app.use((req, res) => {
  console.warn(`[404 NOT FOUND] ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    status: 404,
    error: true,
    message: `Endpoint ${req.originalUrl} tidak ditemukan.`
  });
});

app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    status: 500,
    error: true,
    message: IS_PROD ? 'Internal Server Error' : err.message
  });
});

// --------------------
// 6. BOOTSTRAP (Hanya DB & Listen)
// --------------------
async function start() {
  const db = require('./src/configs/db');

  try {
    console.log("[INIT] Checking Database Connection...");
    // Cek koneksi saja, tidak perlu menunggu settings untuk jalankan rute
    await db.execute('SELECT 1');
    console.log("✅ Database Connected.");
  } catch (err) {
    console.error("❌ [DATABASE ERROR] Gagal konek DB saat startup:", err.message);
  }

  app.listen(PORT, () => {
    console.log(`\n\t*** Server listening on PORT ${PORT} (${NODE_ENV}) ***\n`);
  });
}

start().catch(e => console.error("[FATAL]", e));