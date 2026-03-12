const PaymentSetting = require('../models/payment_setting');

const updatePaymentSettings = async (req, res) => {
  try {
    const { selectedGateway, isTestMode, xendit, doku } = req.body;

    const payload = {
      selected_gateway: selectedGateway,
      is_test_mode: isTestMode ? 1 : 0,
      
      xendit_secret_key: xendit?.secretKey || xendit?.apiKey || '',
      xendit_webhook_url: xendit?.webhookUrl || '',
      xendit_webhook_secret: xendit?.webhookSecret || '',
      xendit_payment_methods: xendit?.paymentMethods || [],
      
      doku_client_id: doku?.clientId || '',
      doku_secret_key: doku?.secretKey || '',
      doku_webhook_url: doku?.webhookUrl || '',
      doku_payment_methods: doku?.paymentMethods || [],
    };

    await PaymentSetting.upsert(payload);
    res.json({ error: false, message: 'Settings updated successfully!' });
  } catch (error) {
    console.error("🔴 DATABASE ERROR:", error.message);
    res.status(500).json({ error: true, message: error.message });
  }
};

const getPaymentSettings = async (req, res) => {
  console.log("📥 Masuk ke Controller getPaymentSettings");
  try {
    const settings = await PaymentSetting.get();
    
    res.json({ 
      error: false, 
      data: settings || {}
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