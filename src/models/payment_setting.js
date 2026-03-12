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
          data.doku_payment_methods = typeof data.doku_payment_methods === 'string' 
            ? JSON.parse(data.doku_payment_methods) : data.doku_payment_methods;
        } catch (e) {
          data.xendit_payment_methods = [];
          data.doku_payment_methods = [];
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
      
      const payload = {
        selected_gateway: data.selected_gateway,
        is_test_mode: data.is_test_mode ? 1 : 0,
        doku_client_id: data.doku_client_id,
        doku_secret_key: data.doku_secret_key,
        doku_webhook_url: data.doku_webhook_url,
        doku_payment_methods: JSON.stringify(data.doku_payment_methods || []),
        xendit_secret_key: data.xendit_secret_key,
        xendit_webhook_url: data.xendit_webhook_url,
        xendit_webhook_secret: data.xendit_webhook_secret,
        xendit_payment_methods: JSON.stringify(data.xendit_payment_methods || []),
        updated_at: new Date()
      };

      if (existing) {
        return await db.query("UPDATE payment_settings SET ? WHERE id = ?", [payload, existing.id]);
      } else {
        return await db.query("INSERT INTO payment_settings SET ?", [payload]);
      }
    } catch (err) {
      console.error("❌ ERROR DI MODEL UPSERT:", err.message);
      throw err;
    }
  }
};

module.exports = PaymentSetting;