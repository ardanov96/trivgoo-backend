const env = process.env.NODE_ENV || 'development';
const dotenvFile = env === 'production' ? '.env' : `.env.${env}`;
require('dotenv').config({ path: dotenvFile });
const mysql = require('mysql2/promise');

const sslConfig = process.env.DB_SSL === 'true' ? {
  minVersion: 'TLSv1.2',
  rejectUnauthorized: true,
} : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  ssl: sslConfig,

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),

  // ✅ jangan unlimited; kalau traffic spike, antrian bisa "numpuk" dan bikin error berantai
  queueLimit: Number(process.env.DB_POOL_QUEUE_LIMIT || 100),

  // lebih tahan idle reset (NAT/WSL/Docker)
  enableKeepAlive: true,
  keepAliveInitialDelay: Number(process.env.DB_KEEPALIVE_DELAY || 5_000),

  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT || 10_000),

  // opsional (tergantung kebutuhan)
  // timezone: "Z", // kalau kamu simpan UTC di DB
  // decimalNumbers: true,
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientDbError(err) {
  const code = err?.code;
  // koneksi / socket transient
  if (
    [
      'ECONNRESET',
      'PROTOCOL_CONNECTION_LOST',
      'ETIMEDOUT',
      'EPIPE',
      'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
      'PROTOCOL_PACKETS_OUT_OF_ORDER',
      'ER_CON_COUNT_ERROR', // too many connections (di MySQL server)
    ].includes(code)
  )
    return true;

  // lock-related retry (opsional tapi sering membantu)
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) return true;

  return false;
}

// backoff kecil biar tidak “spam reconnect”
function backoffMs(attempt) {
  // 1->80ms, 2->160ms, 3->320ms (max 500ms)
  return Math.min(500, 80 * Math.pow(2, attempt - 1));
}

/**
 * Wrapper safe: auto release, retry transient.
 * Return tetap [rows, fields] seperti mysql2/promise.
 */
async function withConn(fn, { retries = 2 } = {}) {
  let lastErr;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    let conn;
    try {
      conn = await pool.getConnection();

      // ⚠️ ping setiap query itu mahal.
      // Kalau kamu sering kena koneksi "stale", cukup ping hanya pada attempt > 1 (saat retry).
      if (attempt > 1) await conn.ping();

      return await fn(conn);
    } catch (err) {
      lastErr = err;

      // penting: kalau koneksi-nya sudah fatal, buang dari pool
      // mysql2 biasanya akan handle, tapi destroy mempercepat “bersih-bersih”
      try {
        if (conn && (err?.fatal || isTransientDbError(err))) conn.destroy();
      } catch {}

      if (!isTransientDbError(err) || attempt === retries + 1) {
        throw err;
      }

      await sleep(backoffMs(attempt));
      // lanjut retry
    } finally {
      // kalau sudah destroy, release aman (mysql2 handle), tapi kita guard aja
      try {
        if (conn) conn.release();
      } catch {}
    }
  }

  throw lastErr; // should never happen
}

async function query(sql, params = []) {
  return withConn((conn) => conn.query(sql, params), { retries: 2 });
}

async function execute(sql, params = []) {
  return withConn((conn) => conn.execute(sql, params), { retries: 2 });
}

/**
 * ✅ OPSIONAL tapi bagus:
 * gunakan transaction wrapper agar tidak bocor commit/rollback.
 */
async function transaction(work, { retries = 1 } = {}) {
  return withConn(
    async (conn) => {
      await conn.beginTransaction();
      try {
        const res = await work(conn);
        await conn.commit();
        return res;
      } catch (e) {
        try {
          await conn.rollback();
        } catch {}
        throw e;
      }
    },
    { retries },
  );
}

module.exports = {
  query,
  execute,
  transaction,
  pool,
};
