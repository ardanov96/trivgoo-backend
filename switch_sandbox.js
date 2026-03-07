// Switch payment_settings to Sandbox mode directly via database
require('dotenv').config({ path: '.env.development' });
const db = require('./src/configs/db');

const paymentMethods = JSON.stringify([
    { id: 'credit_card', name: 'Credit/Debit Card', type: 'CARD', enabled: true },
    { id: 'gopay', name: 'GoPay', type: 'EWALLET', enabled: true },
    { id: 'shopeepay', name: 'ShopeePay', type: 'EWALLET', enabled: true },
    { id: 'bank_transfer', name: 'Bank Transfer (VA)', type: 'BANK_TRANSFER', enabled: true },
    { id: 'qris', name: 'QRIS', type: 'QRIS', enabled: true },
    { id: 'indomaret', name: 'Indomaret', type: 'CSTORE', enabled: false },
    { id: 'alfamart', name: 'Alfamart', type: 'CSTORE', enabled: false },
]);

async function main() {
    try {
        console.log('Connecting to database...');

        // Update payment_settings to sandbox mode with sandbox keys
        const [result] = await db.query(
            `UPDATE payment_settings SET
        selected_gateway = 'midtrans',
        is_test_mode = 1,
        midtrans_server_key = 'SB-Mid-server-GwUP_WGbJPXsDzsNEBRs8IYA',
        midtrans_client_key = 'SB-Mid-client-61XuGAwQ23Poqk0Q',
        midtrans_payment_methods = ?,
        is_active = 1,
        updated_at = NOW()
      WHERE id = 1`,
            [paymentMethods]
        );

        console.log('Update result:', result.affectedRows, 'row(s) affected');

        // Verify
        const [rows] = await db.query('SELECT id, selected_gateway, is_test_mode, midtrans_server_key, midtrans_client_key, is_active FROM payment_settings LIMIT 1');
        console.log('Current settings:', JSON.stringify(rows[0], null, 2));

        console.log('\n✅ Payment settings switched to SANDBOX mode successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

main();
