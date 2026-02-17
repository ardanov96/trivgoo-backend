const db = require('../configs/db');

const PaymentSetting = {
  get: async () => {
    try {
      // Hilangkan destructuring [rows] untuk sementara agar lebih aman
      const result = await db.query('SELECT * FROM payment_settings LIMIT 1');
      
      // mysql2/promise mengembalikan [rows, fields]. Kita ambil index 0.
      const rows = Array.isArray(result) ? result[0] : [];
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error("❌ ERROR DI MODEL GET:", err.message);
      throw err;
    }
  },

  upsert: async (data) => {
    try {
      const existing = await PaymentSetting.get();
      
      // Konversi JSON ke String untuk MySQL
      const xenditMethods = JSON.stringify(data.xendit_payment_methods || []);
      const midtransMethods = JSON.stringify(data.midtrans_payment_methods || []);
      
      if (existing) {
        const sql = `
          UPDATE payment_settings SET 
            selected_gateway = ?, is_test_mode = ?, 
            xendit_api_key = ?, xendit_webhook_url = ?, xendit_webhook_secret = ?, xendit_payment_methods = ?, 
            midtrans_server_key = ?, midtrans_client_key = ?, midtrans_webhook_url = ?, midtrans_payment_methods = ?, 
            updated_at = NOW() 
          WHERE id = ?`;
        
        const params = [
          data.selected_gateway, data.is_test_mode,
          data.xendit_api_key, data.xendit_webhook_url, data.xendit_webhook_secret, xenditMethods,
          data.midtrans_server_key, data.midtrans_client_key, data.midtrans_webhook_url, midtransMethods,
          existing.id
        ];
        return await db.execute(sql, params);
      } else {
        const sql = `
          INSERT INTO payment_settings (
            selected_gateway, is_test_mode, 
            xendit_api_key, xendit_webhook_url, xendit_webhook_secret, xendit_payment_methods, 
            midtrans_server_key, midtrans_client_key, midtrans_webhook_url, midtrans_payment_methods, 
            is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`;
        
        const params = [
          data.selected_gateway, data.is_test_mode,
          data.xendit_api_key, data.xendit_webhook_url, data.xendit_webhook_secret, xenditMethods,
          data.midtrans_server_key, data.midtrans_client_key, data.midtrans_webhook_url, midtransMethods
        ];
        return await db.execute(sql, params);
      }
    } catch (err) {
      console.error("❌ ERROR DI MODEL UPSERT:", err.message);
      throw err;
    }
  }
};

module.exports = PaymentSetting;