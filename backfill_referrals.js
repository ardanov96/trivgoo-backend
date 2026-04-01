require('dotenv').config({ path: '.env.development' });
const db = require('./src/configs/db');
const crypto = require('crypto');

async function generateUniqueCode(conn) {
  while (true) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `TRV${randomHex}`;
    const [rows] = await conn.query('SELECT id FROM users WHERE referral_code = ?', [code]);
    if (rows.length === 0) return code;
  }
}

async function run() {
  try {
    console.log("Backfilling missing referral codes...");
    const [users] = await db.query('SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ""');
    console.log(`Found ${users.length} users needing referral codes.`);

    for (const user of users) {
      const code = await generateUniqueCode(db);
      await db.query('UPDATE users SET referral_code = ? WHERE id = ?', [code, user.id]);
      console.log(`Assigned ${code} to user ID ${user.id}`);
    }

    console.log("Backfill complete!");
  } catch (err) {
    console.error("Backfill failed:", err);
  } finally {
    process.exit(0);
  }
}

run();
