const PaymentSetting = require('../models/payment_setting');

const updatePaymentSettings = async (req, res) => {
  try {
    const { selectedGateway, isTestMode, xendit, midtrans } = req.body;

    const payload = {
      selected_gateway: selectedGateway,
      is_test_mode: isTestMode ? 1 : 0, // MySQL boolean biasanya 1/0
      xendit_api_key: xendit.apiKey,
      xendit_webhook_url: xendit.webhookUrl,
      xendit_webhook_secret: xendit.webhookSecret,
      xendit_payment_methods: xendit.paymentMethods, // Kirim aslinya saja
      midtrans_server_key: midtrans.serverKey,
      midtrans_client_key: midtrans.clientKey,
      midtrans_webhook_url: midtrans.webhookUrl,
      midtrans_payment_methods: midtrans.paymentMethods // Kirim aslinya saja
    };

    await PaymentSetting.upsert(payload);
    res.json({ error: false, message: 'Settings updated successfully!' });
  } catch (error) {
    console.error("🔴 DATABASE ERROR:", error);
    res.status(500).json({ error: true, message: error.message });
  }
};