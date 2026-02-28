const db = require('../configs/db');

const PaymentSetting = {
  get: async () => {
    try {
      const [rows] = await db.query('SELECT * FROM payment_settings LIMIT 1');
      
      if (Array.isArray(rows) && rows.length > 0) {
        const data = rows[0];
        
        // Parsing JSON string kembali ke Object agar Frontend tidak error
        try {
          data.xendit_payment_methods = typeof data.xendit_payment_methods === 'string' 
            ? JSON.parse(data.xendit_payment_methods) : data.xendit_payment_methods;
          data.midtrans_payment_methods = typeof data.midtrans_payment_methods === 'string' 
            ? JSON.parse(data.midtrans_payment_methods) : data.midtrans_payment_methods;
        } catch (e) {
          data.xendit_payment_methods = [];
          data.midtrans_payment_methods = [];
        }
        
        return data;
      }
      return null;
    } catch (err) {
      console.error("❌ ERROR DI MODEL GET:", err.message);
      throw err;
    }
  },

  upsert: async (data) => {
    try {
      const existing = await PaymentSetting.get();
      const xenditMethods = JSON.stringify(data.xendit_payment_methods || []);
      const midtransMethods = JSON.stringify(data.midtrans_payment_methods || []);
      
      if (existing) {
        const sql = `
          UPDATE payment_settings SET 
            selected_gateway = ?,         -- 1
            is_test_mode = ?,             -- 2
            midtrans_merchant_id = ?,     -- 3
            xendit_secret_key = ?,        -- 4
            xendit_webhook_url = ?,       -- 5
            xendit_webhook_secret = ?,    -- 6
            xendit_payment_methods = ?,   -- 7
            midtrans_server_key = ?,      -- 8
            midtrans_client_key = ?,      -- 9
            midtrans_webhook_url = ?,     
            midtrans_payment_methods = ?, 
            updated_at = NOW() 
          WHERE id = ?`;                  

        // PASTIKAN ADA 12 DATA DALAM ARRAY INI
        const params = [
          data.selected_gateway,      // 1
          data.is_test_mode,          // 2
          data.midtrans_merchant_id,  // 3
          data.xendit_secret_key,        // 4
          data.xendit_webhook_url,    // 5
          data.xendit_webhook_secret, // 6
          xenditMethods,              // 7
          data.midtrans_server_key,   // 8
          data.midtrans_client_key,   // 9
          data.midtrans_webhook_url,  // 10
          midtransMethods,            // 11
          existing.id                 // 12 (untuk WHERE id = ?)
        ];

        return await db.query(sql, params);
      } else {
        const insertData = {
          ...data,
          xendit_payment_methods: xenditMethods,   // Pakai string JSON
          midtrans_payment_methods: midtransMethods // Pakai string JSON
        };
        const sql = `INSERT INTO payment_settings SET ?`;
        return await db.query(sql, insertData);
      }
    } catch (err) {
      console.error("❌ ERROR DI MODEL UPSERT:", err.message);
      throw err;
    }
  }
};

module.exports = PaymentSetting;