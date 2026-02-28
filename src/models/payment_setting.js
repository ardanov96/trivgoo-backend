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
      
      // 1. Pastikan Methods menjadi String JSON
      const xenditMethods = JSON.stringify(data.xendit_payment_methods || []);
      const midtransMethods = JSON.stringify(data.midtrans_payment_methods || []);
      
      // 2. Buat objek data yang bersih (nama key harus sesuai nama kolom di DB)
      const payload = {
        selected_gateway: data.selected_gateway,
        is_test_mode: data.is_test_mode ? 1 : 0,
        midtrans_merchant_id: data.midtrans_merchant_id,
        midtrans_server_key: data.midtrans_server_key,
        midtrans_client_key: data.midtrans_client_key,
        midtrans_webhook_url: data.midtrans_webhook_url,
        midtrans_payment_methods: midtransMethods,
        xendit_secret_key: data.xendit_secret_key,
        xendit_webhook_url: data.xendit_webhook_url,
        xendit_webhook_secret: data.xendit_webhook_secret,
        xendit_payment_methods: xenditMethods,
        updated_at: new Date()
      };

      if (existing) {
        // UPDATE menggunakan format SET ?
        const sql = `UPDATE payment_settings SET ? WHERE id = ?`;
        return await db.query(sql, [payload, existing.id]);
      } else {
        // INSERT menggunakan format SET ?
        const sql = `INSERT INTO payment_settings SET ?`;
        return await db.query(sql, payload);
      }
    } catch (err) {
      console.error("❌ ERROR DI MODEL UPSERT:", err.message);
      throw err;
    }
  }
};

module.exports = PaymentSetting;