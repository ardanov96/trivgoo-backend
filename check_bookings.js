require('dotenv').config({ path: '.env.development' });
const db = require('./src/configs/db');
(async () => {
    try {
        // Test with minimal columns - no JOIN
        const [rows] = await db.query('SELECT b.id, b.user_id, b.product_id, b.product_name, b.user_name, b.quantity, b.total_price, b.date, b.status FROM bookings b WHERE b.user_id = 68 LIMIT 3');
        console.log('BASIC QUERY OK:', rows.length, 'rows');
        if (rows.length > 0) console.log('SAMPLE:', JSON.stringify(rows[0]));

        // Check if products has image_url or image column
        const [pcols] = await db.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='products' AND COLUMN_NAME LIKE '%imag%'");
        console.log('PRODUCT IMAGE COLS:', pcols.map(c => c.COLUMN_NAME));
    } catch (e) {
        console.log('ERR:', e.message);
    }
    process.exit(0);
})();
