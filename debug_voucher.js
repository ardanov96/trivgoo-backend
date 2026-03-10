/**
 * debug_voucher.js
 * Jalankan: node debug_voucher.js
 * Untuk cek apakah model/controller voucher bisa load & query ke DB
 */
require('dotenv').config({ path: '.env.development' });

async function main() {
  console.log('\n=== DEBUG VOUCHER ===\n');

  // 1. Test require model
  console.log('[1] Memuat src/models/voucher.js ...');
  let m;
  try {
    m = require('./src/models/voucher');
    console.log('    ✅ Model loaded. Exports:', Object.keys(m).join(', '));
  } catch (e) {
    console.error('    ❌ GAGAL load model:', e.message);
    console.error('    Stack:', e.stack);
    process.exit(1);
  }

  // 2. Test require controller
  console.log('[2] Memuat src/controllers/voucher.js ...');
  try {
    const ctrl = require('./src/controllers/voucher');
    console.log('    ✅ Controller loaded. Exports:', Object.keys(ctrl).join(', '));
  } catch (e) {
    console.error('    ❌ GAGAL load controller:', e.message);
    console.error('    Stack:', e.stack);
    process.exit(1);
  }

  // 3. Test require route
  console.log('[3] Memuat src/routes/voucher.js ...');
  try {
    const route = require('./src/routes/voucher');
    console.log('    ✅ Route loaded.');
  } catch (e) {
    console.error('    ❌ GAGAL load route:', e.message);
    process.exit(1);
  }

  // 4. Test DB query
  console.log('[4] Test query ke DB (list_vouchers) ...');
  try {
    const result = await m.list_vouchers({ limit: 3 });
    console.log('    ✅ Query berhasil!');
    console.log('    Total vouchers:', result.total);
    console.log('    Data sample:', result.vouchers.slice(0, 2).map(v => ({
      id: v.id, code: v.code, scope_ids: v.scope_ids
    })));
  } catch (e) {
    console.error('    ❌ GAGAL query:', e.message);
    console.error('    Stack:', e.stack);
  }

  // 5. Test require helpers/response
  console.log('[5] Memuat src/helpers/response.js ...');
  try {
    const misc = require('./src/helpers/response');
    console.log('    ✅ Helper loaded. Type:', typeof misc, '| Keys:', 
      typeof misc === 'object' ? Object.keys(misc).join(', ') : '(function)');
  } catch (e) {
    console.error('    ❌ GAGAL load response helper:', e.message);
    console.error('    → Cek path: apakah file ada di src/helpers/response.js ?');
  }

  console.log('\n=== SELESAI ===\n');
  process.exit(0);
}

main().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});