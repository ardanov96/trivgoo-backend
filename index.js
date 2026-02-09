/**
 * Optimized Express bootstrap (session-based, optional Redis store)
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
// ENV + defaults
// --------------------
const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_DEV = !IS_PROD;

// ✅ PERBAIKAN: Tambahkan dev.trivgoo.com ke allowed origins
const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = new Set(
  envOrigins.length ? envOrigins : [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://dev.trivgoo.com',  // ✅ TAMBAHKAN INI
    'http://dev.trivgoo.com',   // ✅ TAMBAHKAN INI (jika ada)
  ],
);

if (IS_PROD && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET wajib di production.');
}

// --------------------
// Trust proxy (IMPORTANT for HTTPS)
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

// ✅ PERBAIKAN: Body parsers HARUS sebelum routes
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '5mb' }));
app.use(cookieParser());

// --------------------
// CORS - PERBAIKAN
// --------------------
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/postman/server-to-server
  return allowedOrigins.has(origin);
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) {
      cb(null, true);
    } else {
      cb(null, false); // ✅ Jangan reject, biarkan request lewat
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ✅ HAPUS atau COMMENT bagian ini - terlalu strict
// app.use((req, res, next) => {
//   const origin = req.headers.origin;
//   if (origin && !isAllowedOrigin(origin)) {
//     return res.status(403).json({
//       status: 403,
//       error: true,
//       message: `CORS blocked for origin: ${origin}`,
//     });
//   }
//   next();
// });

// --------------------
// Static files
// --------------------
app.use(
  express.static('public', {
    etag: true,
    lastModified: true,
    maxAge: IS_PROD ? '7d' : 0,
  }),
);

// --------------------
// Request lifecycle debug
// --------------------
app.use((req, res, next) => {
  req.on('aborted', () => {
    if (IS_DEV) console.warn('[ABORTED]', req.method, req.originalUrl);
  });
  next();
});

// --------------------
// No-cache for API
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
    socket: {
      keepAlive: true,
      reconnectStrategy: (retries) => Math.min(retries * 200, 2000),
    },
  });

  redisClient.on('error', (err) => console.error('[REDIS] error:', err));
  await redisClient.connect();
  console.log('[REDIS] connected');

  const v7Default = connectRedisPkg?.default;
  if (v7Default && typeof v7Default.create === 'function') {
    sessionStore = v7Default.create({ client: redisClient, prefix: 'sess:' });
    return;
  }

  if (typeof connectRedisPkg === 'function') {
    const RedisStoreCtor = connectRedisPkg(session);
    sessionStore = new RedisStoreCtor({ client: redisClient, prefix: 'sess:' });
    return;
  }

  const RedisStoreCtor = connectRedisPkg?.RedisStore || connectRedisPkg?.default;
  if (typeof RedisStoreCtor !== 'function') {
    throw new Error('connect-redis export tidak cocok. Cek versi: npm ls connect-redis');
  }

  sessionStore = new RedisStoreCtor({ client: redisClient, prefix: 'sess:' });
}

function buildSessionOptions(dynamicTimeoutMins) {
  const timeoutMs = (dynamicTimeoutMins || 30) * 60 * 1000;

  const cookie = {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    secure: IS_PROD,
    maxAge: timeoutMs,
  };

  return {
    name: process.env.SESSION_NAME || 'sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie,
  };
}

// --------------------
// Error handler
// --------------------
function errorHandler(err, req, res, next) {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      status: 413,
      error: true,
      message: 'Payload too large',
    });
  }

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
// Bootstrap server
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

  // ✅ Session middleware
  app.use(session(buildSessionOptions(dbSettings.session_timeout)));

  // ✅ PENTING: Mount routes SETELAH semua middleware di atas
  app.use('/', routerNav);

  // ✅ 404 handler
  app.use((req, res) => {
    console.log('[404]', req.method, req.originalUrl); // ✅ Log untuk debugging
    res.status(404).json({
      status: 404,
      error: true,
      message: 'Not Found',
    });
  });

  // ✅ Error handler
  app.use(errorHandler);

  const server = app.listen(PORT, () => {
    console.log(`\n\t*** Server listening on PORT ${PORT} (${NODE_ENV}) ***`);
    console.log(`\tAllowed origins:`, Array.from(allowedOrigins));
  });

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

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED_REJECTION]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT_EXCEPTION]', err);
  });

  module.exports = server;
}

start().catch((e) => {
  console.error('[FATAL] failed to start:', e);
  process.exit(1);
});