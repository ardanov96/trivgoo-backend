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
      
      // Pastikan data methods adalah string JSON
      const xenditMethods = JSON.stringify(data.xendit_payment_methods || []);
      const midtransMethods = JSON.stringify(data.midtrans_payment_methods || []);
      
      // Susun objek data sesuai kolom tabel
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
        // UPDATE otomatis mencocokkan key objek dengan nama kolom
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