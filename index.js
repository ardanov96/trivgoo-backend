/**
 * Optimized Express bootstrap (session-based, optional Redis store)
 * - safer CORS
 * - disable cache for API (avoid 304 for /api)
 * - better error handling (413 + invalid JSON)
 * - graceful shutdown (close server + redis)
 * - optional timeouts to reduce random socket issues
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const settingsRoutes = require('./src/routes/settings');

const routerNav = require('./src/index');

const app = express();

// --------------------
// ENV + defaults
// --------------------
const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_DEV = !IS_PROD;

// prefer explicit list in ENV for prod usage
// example: CORS_ORIGINS="https://admin.example.com,https://app.example.com"
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set(
  envOrigins.length ? envOrigins : [
    'http://localhost:3000',
    'http://192.168.1.101:3000', 
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
);

if (IS_PROD && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET wajib di production.');
}

// --------------------
// Trust proxy (IMPORTANT)
// --------------------
app.set('trust proxy', 1);

// --------------------
// Middlewares (order matters)
// --------------------
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(compression());

// Static: idealnya set cache untuk aset (bukan API)
app.use(
  express.static('public', {
    etag: true,
    lastModified: true,
    maxAge: IS_PROD ? '7d' : 0,
  }),
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '5mb' }));
app.use(cookieParser());

// --------------------
// Request lifecycle (debug aborted requests)
// --------------------
app.use((req, res, next) => {
  req.on('aborted', () => {
    // client putus sebelum selesai; sering terlihat sebagai ECONNRESET di sisi lain
    // log ringan aja
    if (IS_DEV) console.warn('[ABORTED]', req.method, req.originalUrl);
  });
  next();
});

// --------------------
// CORS
// --------------------
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/postman/server-to-server
  return allowedOrigins.has(origin);
}

const corsOptions = {
  origin(origin, cb) {
    cb(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// cukup ini saja; cors middleware sudah handle preflight
app.options('*', cors(corsOptions));

// (Optional) reject origin yang ga diizinkan dengan pesan jelas
// NOTE: ini jalan setelah cors() jadi hanya untuk “message clarity”
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      status: 403,
      error: true,
      message: `CORS blocked for origin: ${origin}`,
    });
  }
  next();
});

// --------------------
// No-cache for API (hindari 304 untuk endpoint session / auth)
// --------------------
app.use('/api', (_, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// --------------------
// Session store (Redis optional)
// --------------------
let sessionStore;
let redisClient;

async function initSessionStore() {
  if (!process.env.REDIS_URL) {
    console.warn('[WARN] REDIS_URL not set. Using MemoryStore (DEV ONLY).');
    return;
  }

  const { createClient } = require('redis');
  const connectRedisPkg = require('connect-redis');

  redisClient = createClient({
    url: process.env.REDIS_URL,
    // bantu koneksi lebih tahan NAT/idle reset
    socket: {
      keepAlive: true,
      reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
    },
  });

  redisClient.on('error', (err) => console.error('[REDIS] error:', err));
  await redisClient.connect();
  console.log('[REDIS] connected');

  // connect-redis v7: default export w/ create()
  const v7Default = connectRedisPkg?.default;
  if (v7Default && typeof v7Default.create === 'function') {
    sessionStore = v7Default.create({ client: redisClient, prefix: 'sess:' });
    return;
  }

  // connect-redis v6: function(session) -> ctor
  if (typeof connectRedisPkg === 'function') {
    const RedisStoreCtor = connectRedisPkg(session);
    sessionStore = new RedisStoreCtor({ client: redisClient, prefix: 'sess:' });
    return;
  }

  // other shapes
  const RedisStoreCtor = connectRedisPkg?.RedisStore || connectRedisPkg?.default;
  if (typeof RedisStoreCtor !== 'function') {
    throw new Error('connect-redis export tidak cocok. Cek versi: npm ls connect-redis');
  }

  sessionStore = new RedisStoreCtor({ client: redisClient, prefix: 'sess:' });
}

function buildSessionOptions(dynamicTimeoutMins) {
  // kalau FE & BE beda domain dan butuh cookie cross-site:
  // sameSite: 'none' + secure: true (HTTPS)

  const timeoutMs = (dynamicTimeoutMins || 30) * 60 * 1000;

  const cookie = {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    secure: IS_PROD, // true jika HTTPS
    maxAge: timeoutMs,
  };

  return {
    name: process.env.SESSION_NAME || 'sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      // Saat pakai IP (bukan HTTPS), sameSite harus 'lax'
      // Jangan gunakan 'none' kecuali kamu pakai HTTPS
      sameSite: 'lax', 
      secure: false, // Harus false karena kamu tidak pakai HTTPS (http://192.168.1.99)
      maxAge: timeoutMs,
    },
  };
}

// --------------------
// Error handler
// --------------------
function errorHandler(err, _req, res, _next) {
  // payload terlalu besar
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      status: 413,
      error: true,
      message: 'Payload too large',
    });
  }

  // invalid JSON
  if (err instanceof SyntaxError && err?.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 400,
      error: true,
      message: 'Invalid JSON',
    });
  }

  console.error('[ERROR]', err);
  res.status(500).json({
    status: 500,
    error: true,
    message: IS_PROD ? 'Internal Server Error' : String(err?.message || err),
  });
}

// --------------------
// Bootstrap server + graceful shutdown
// --------------------
async function start() {
  // await initSessionStore();
  const db = require('./src/configs/db');

  let dbSettings = {};
  try {
    console.log("[INIT] Fetching system settings from DB...");
    const [rows] = await db.execute('SELECT session_timeout FROM settings WHERE id = 1');
    if (rows.length > 0) {
      dbSettings = rows[0];
      console.log(`[INIT] Session timeout set to ${dbSettings.session_timeout} minutes from DB.`);
    }
  } catch (err) {
    console.error("[ERROR] Failed to fetch settings on startup, using defaults:", err.message);
  }

  // ✅ session harus dipasang sebelum routes
  app.use(session(buildSessionOptions(dbSettings.session_timeout)));

  app.use('/api', settingsRoutes);

  // ✅ routes
  app.use('/', routerNav);

  app.use((_, res) => res.sendStatus(404));

  app.use(errorHandler);

  // const server = app.listen(PORT, () => {
  //   console.log(`\n\t*** Server listening on PORT ${PORT} (${NODE_ENV}) ***`);
  // });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n\t*** Server listening on http://192.168.1.101:${PORT} (${NODE_ENV}) ***`);
  });

  // optional: timeouts untuk request lama agar lebih terkontrol
  server.requestTimeout = Number(process.env.SERVER_REQUEST_TIMEOUT_MS || 120_000);
  server.headersTimeout = Number(process.env.SERVER_HEADERS_TIMEOUT_MS || 125_000);
  server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 65_000);

  const shutdown = async (signal) => {
    console.log(`[SHUTDOWN] ${signal} received. Closing server...`);
    server.close(async () => {
      try {
        if (redisClient) {
          await redisClient.quit();
          console.log('[REDIS] disconnected');
        }
      } catch (e) {
        console.error('[SHUTDOWN] redis quit error:', e);
      } finally {
        process.exit(0);
      }
    });

    // fallback hard-exit
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // penting: jangan biarkan unhandled crash tanpa log
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED_REJECTION]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT_EXCEPTION]', err);
    // opsional: exit biar PM2 restart bersih
    // process.exit(1);
  });

  module.exports = server;
}

start().catch((e) => {
  console.error('[FATAL] failed to start:', e);
  process.exit(1);
});
