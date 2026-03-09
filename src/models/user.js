const db = require("../configs/db");
const knex = require('../configs/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

function to_int(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function find_user_by_email(email) {
  if (!email) return null;

  const [rows] = await db.query(
    `
      SELECT *
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [email]
  );

  return rows[0] || null;
}

async function find_user_by_id(user_id) {
  const uid = to_int(user_id);
  if (!uid || uid <= 0) return null;

  const [rows] = await db.query(
    `
      SELECT
        u.*,
        up.avatar_url AS avatar
      FROM users u
      LEFT JOIN user_profiles up
        ON up.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
    `,
    [uid]
  );

  return rows[0] || null;
}

async function create_user({
  name,
  email,
  password_hash,
  role,
  specialization = null,
  phone_number = null,
}) {
  const [result] = await db.query(
    `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        specialization,
        phone_number
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [name, email, password_hash, role, specialization, phone_number]
  );

  const [rows] = await db.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        specialization,
        verification_status,
        is_active,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [result.insertId]
  );

  return rows[0] || null;
}

async function update_verification_status(user_id, status) {
  const st = String(status || "").toUpperCase();

  const [result] = await db.query(
    `
      UPDATE users
      SET verification_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [st, user_id]
  );

  return result;
}

async function update_user_profile(userId, { name, avatar_url, new_password }) {
  return await db.transaction(async (conn) => {

    if (name) {
      await conn.query('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
    }

    if (avatar_url) {
      await conn.query(`
        INSERT INTO user_profiles (user_id, avatar_url) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE avatar_url = VALUES(avatar_url)
      `, [userId, avatar_url]);
    }

    if (new_password) {
      const hashedPassword = await bcrypt.hash(new_password, 10);
      await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId]);
    }

    return true;
  });
}

// Tambahkan fungsi untuk cek password lama
async function verify_password(userId, plainPassword) {
  const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!rows[0] || !rows[0].password_hash) return false;

  // Sekarang bcrypt sudah didefinisikan dan bisa digunakan
  return await bcrypt.compare(plainPassword, rows[0].password_hash);
}

/**
 * Simpan reset token ke DB (expires 1 jam)
 */
async function save_reset_token(user_id, token) {
  const expires_at = new Date(Date.now() + 60 * 60 * 1000); // +1 jam

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       token      = VALUES(token),
       expires_at = VALUES(expires_at),
       used       = 0,
       created_at = CURRENT_TIMESTAMP`,
    [user_id, token, expires_at]
  );
}

/**
 * Cari token yang valid (belum expired & belum dipakai)
 */
async function find_valid_reset_token(token) {
  const [rows] = await db.query(
    `SELECT prt.*, u.email, u.name, u.role
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token = ?
       AND prt.expires_at > NOW()
       AND prt.used = 0
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

/**
 * Tandai token sebagai sudah dipakai
 */
async function mark_token_used(token) {
  await db.query(
    `UPDATE password_reset_tokens SET used = 1 WHERE token = ?`,
    [token]
  );
}

/**
 * Ganti password user
 */
async function reset_password(user_id, new_password) {
  const hashed = await bcrypt.hash(new_password, 10);
  await db.query(
    `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [hashed, user_id]
  );
}

/**
 * Aktivasi Email
 */
async function save_activation_token(email, token) {
  const expires_at = new Date(Date.now() + 20 * 60 * 1000); // 20 Menit

  await db.query(
    `INSERT INTO email_verifications (email, token, expires_at)
     VALUES (?, ?, ?)`,
    [email, token, expires_at]
  );
}

async function verify_email_token(token) {
  const [rows] = await db.query(
    `SELECT * FROM email_verifications
     WHERE token = ? AND expires_at > NOW()
     LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

async function mark_email_verified(email) {
  await db.query(`UPDATE users SET verification_status = 'VERIFIED', updated_at = NOW() WHERE email = ?`, [email]);
  await db.query(`DELETE FROM email_verifications WHERE email = ?`, [email]);
}

module.exports = {
  find_user_by_email,
  find_user_by_id,
  create_user,
  update_verification_status,
  update_user_profile,
  verify_password,
  save_reset_token,
  find_valid_reset_token,
  mark_token_used,
  reset_password,
  save_activation_token,
  verify_email_token,
  mark_email_verified,

  update_user: async (id, data) => {
    await knex('users').where({ id }).update(data);
    return knex('users').where({ id }).first();
  },
};
