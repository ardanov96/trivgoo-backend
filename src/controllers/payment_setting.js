const PaymentSetting = require('../models/payment_setting');

const updatePaymentSettings = async (req, res) => {
  console.log("📥 Masuk ke Controller updatePaymentSettings");
  try {
    const { selectedGateway, isTestMode, xendit, midtrans } = req.body;

    const payload = {
      selected_gateway: selectedGateway || 'xendit',
      is_test_mode: isTestMode ? 1 : 0,
      xendit_api_key: xendit?.apiKey || '',
      xendit_webhook_url: xendit?.webhookUrl || '',
      xendit_webhook_secret: xendit?.webhookSecret || '',
      xendit_payment_methods: xendit?.paymentMethods || [],
      midtrans_server_key: midtrans?.serverKey || '',
      midtrans_client_key: midtrans?.clientKey || '',
      midtrans_webhook_url: midtrans?.webhookUrl || '',
      midtrans_payment_methods: midtrans?.paymentMethods || []
    };

    await PaymentSetting.upsert(payload);
    res.json({ error: false, message: 'Settings updated successfully!' });
  } catch (error) {
    console.error("🔴 CONTROLLER ERROR:", error);
    res.status(500).json({ error: true, message: error.message });
  }
};

const getPaymentSettings = async (req, res) => {
  console.log("📥 Masuk ke Controller getPaymentSettings");
  try {
    const settings = await PaymentSetting.get();
    
    // Kirim respon balik ke frontend!
    res.json({ 
      error: false, 
      data: settings || {} // Kirim objek kosong jika data belum ada di DB
    });
  } catch (error) {
    console.error("🔴 CONTROLLER ERROR:", error);
    res.status(500).json({ error: true, message: error.message });
  }
};

module.exports = { 
  updatePaymentSettings,
  getPaymentSettings 
};