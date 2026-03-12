// Switch payment_settings to DOKU Sandbox mode directly via database
require('dotenv').config({ path: '.env.development' });
const db = require('./src/configs/db');

const paymentMethods = JSON.stringify([
    { id: 'virtual_account', name: 'Virtual Account', type: 'BANK_TRANSFER', enabled: true },
    { id: 'credit_card', name: 'Credit/Debit Card', type: 'CARD', enabled: true },
    { id: 'qris', name: 'QRIS', type: 'QRIS', enabled: true },
    { id: 'ewallet', name: 'E-Wallet (OVO, DANA, LinkAja)', type: 'EWALLET', enabled: true },
    { id: 'convenience_store', name: 'Convenience Store (Alfamart/Indomaret)', type: 'CSTORE', enabled: false },
]);

async function main() {
    try {
        console.log('Connecting to database...');

        const clientId = process.env.DOKU_CLIENT_ID || '';
        const secretKey = process.env.DOKU_SECRET_KEY || '';
        const webhookUrl = process.env.DOKU_CALLBACK_URL || '';

        // Update payment_settings to DOKU sandbox mode
        const [result] = await db.query(
            `UPDATE payment_settings SET
        selected_gateway = 'doku',
        is_test_mode = 1,
        doku_client_id = ?,
        doku_secret_key = ?,
        doku_webhook_url = ?,
        doku_payment_methods = ?,
        is_active = 1,
        updated_at = NOW()
      WHERE id = 1`,
            [clientId, secretKey, webhookUrl, paymentMethods]
        );

        console.log('Update result:', result.affectedRows, 'row(s) affected');

        // Verify
        const [rows] = await db.query('SELECT id, selected_gateway, is_test_mode, doku_client_id, is_active FROM payment_settings LIMIT 1');
        console.log('Current settings:', JSON.stringify(rows[0], null, 2));

        console.log('\n✅ Payment settings switched to DOKU SANDBOX mode successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

main();
