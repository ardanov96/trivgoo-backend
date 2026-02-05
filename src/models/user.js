const db = require("../configs/db");
const knex = require('../configs/db');

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
}) {
  const [result] = await db.query(
    `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        specialization
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    [name, email, password_hash, role, specialization]
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

module.exports = {
  find_user_by_email,
  find_user_by_id,
  create_user,
  update_verification_status,

  update_user: async (id, data) => {
    await knex('users').where({ id }).update(data);
    return knex('users').where({ id }).first();
  },
};
