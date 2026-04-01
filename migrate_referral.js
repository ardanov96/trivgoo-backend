require('dotenv').config({ path: '.env.development' });
const db = require('./src/configs/db');
const crypto = require('crypto');

async function generateUniqueCode(conn) {
  while (true) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    const code = `TRV${randomHex}`;
    const [rows] = await conn.query('SELECT id FROM users WHERE referral_code = ?', [code]);
    if (rows.length === 0) return code;
  }
}

async function run() {
  try {
    console.log("Adding columns...");
    try {
      await db.query(`ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) UNIQUE NULL AFTER id;`);
      console.log("Column referral_code added.");
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log("Column referral_code already exists.");
      else throw e;
    }

    try {
      await db.query(`ALTER TABLE users ADD COLUMN referred_by_id INT NULL AFTER referral_code;`);
      console.log("Column referred_by_id added.");
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log("Column referred_by_id already exists.");
      else throw e;
    }

    console.log("Backfilling missing referral codes...");
    const [users] = await db.query('SELECT id FROM users WHERE referral_code IS NULL');
    console.log(`Found ${users.length} users needing referral codes.`);

    for (const user of users) {
      const code = await generateUniqueCode(db);
      await db.query('UPDATE users SET referral_code = ? WHERE id = ?', [code, user.id]);
      console.log(`Assigned ${code} to user ID ${user.id}`);
    }

    // Now alter table to NOT NULL
    console.log("Making referral_code NOT NULL...");
    await db.query(`ALTER TABLE users MODIFY COLUMN referral_code VARCHAR(20) NOT NULL;`);
    console.log("Migration complete!");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

run();
