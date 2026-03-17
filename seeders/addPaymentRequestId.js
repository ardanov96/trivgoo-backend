// seeders/addPaymentRequestId.js
// Migration: tambahkan kolom payment_request_id ke tabel bookings
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.development') });

const db = require('../src/configs/db');

async function run() {
  try {
    await db.query("ALTER TABLE bookings ADD COLUMN payment_request_id VARCHAR(100) DEFAULT NULL");
    console.log('✅ Migration berhasil: kolom payment_request_id ditambahkan ke tabel bookings.');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ Kolom payment_request_id sudah ada, migration dilewati.');
    } else {
      console.error('❌ Migration Error:', e.message);
      process.exit(1);
    }
  }
  process.exit(0);
}

run();
