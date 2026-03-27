const db = require('../configs/db');

const PaymentSetting = {
  get: async (raw = false) => {
    try {
      const [rows] = await db.query('SELECT * FROM payment_settings LIMIT 1');
      
      if (Array.isArray(rows) && rows.length > 0) {
        const data = rows[0];
        
        try {
          data.xendit_payment_methods = typeof data.xendit_payment_methods === 'string' 
            ? JSON.parse(data.xendit_payment_methods) : data.xendit_payment_methods;
          data.doku_payment_methods = typeof data.doku_payment_methods === 'string' 
            ? JSON.parse(data.doku_payment_methods) : data.doku_payment_methods;
        } catch (e) {
          data.xendit_payment_methods = [];
          data.doku_payment_methods = [];
        }
        
        // Obscure secrets for the frontend
        if (!raw) {
          const obscureKey = (key) => {
            if (!key) return '';
            if (key.length <= 8) return '********';
            return key.substring(0, 8) + '****' + key.slice(-4);
          };
          data.doku_secret_key = obscureKey(data.doku_secret_key);
          data.xendit_secret_key = obscureKey(data.xendit_secret_key);
          data.xendit_webhook_secret = obscureKey(data.xendit_webhook_secret);
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
      const existing = await PaymentSetting.get(true);
      
      const payload = {
        selected_gateway: data.selected_gateway || 'xendit',
        is_test_mode: data.is_test_mode ? 1 : 0,
        doku_client_id: data.doku_client_id,
        doku_webhook_url: data.doku_webhook_url,
        doku_payment_methods: JSON.stringify(data.doku_payment_methods || []),
        xendit_webhook_url: data.xendit_webhook_url,
        xendit_payment_methods: JSON.stringify(data.xendit_payment_methods || []),
        updated_at: new Date()
      };

      // Only apply keys that were provided cleanly without obscured characters
      if (data.doku_secret_key && !data.doku_secret_key.includes('****')) {
        payload.doku_secret_key = data.doku_secret_key;
      }
      if (data.xendit_secret_key && !data.xendit_secret_key.includes('****')) {
        payload.xendit_secret_key = data.xendit_secret_key;
      }
      if (data.xendit_webhook_secret && !data.xendit_webhook_secret.includes('****')) {
        payload.xendit_webhook_secret = data.xendit_webhook_secret;
      }

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