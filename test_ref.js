require('dotenv').config({ path: '.env.development' });
const db = require('./src/configs/db');

async function test() {
  const [rows] = await db.query('SELECT id, name, referral_code FROM users');
  console.log(rows.map(r => `${r.id} | ${r.name} | '${r.referral_code}'`).join('\n'));
  process.exit();
}
test();
