// src/services/payment/gateways/xendit.js
const axios = require('axios');

async function createTransaction(order, config) {
  const { secretKey } = config;
  if (!secretKey) throw new Error('Xendit secret key missing. Please config in Admin Settings.');
  
  const amount = Math.round(Number(order.amount));
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const requestBody = {
    external_id: order.id,
    amount,
    payer_email: order.email || 'customer@example.com',
    description: order.product_name || 'Trivgoo Booking',
    currency: 'IDR',
    invoice_duration: 86400, // 24 hours
    success_redirect_url: frontendUrl + '/payment/result?invoice=' + order.id, // removed status=SUCCESS param to prevent frontend forgery
    failure_redirect_url: frontendUrl + '/payment/result?invoice=' + order.id
  };

  try {
    const response = await axios.post('https://api.xendit.co/v2/invoices', requestBody, {
      auth: { username: secretKey, password: '' },
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Ensure invoice URL exists
    const paymentUrl = response.data?.invoice_url;
    if (!paymentUrl) throw new Error('Xendit missing payment URL');
    
    // gateway_invoice_id is heavily needed for Xendit cancellation
    const gatewayInvoiceId = response.data?.id; 
    
    return { 
      payment_url: paymentUrl, 
      invoice_number: order.id, 
      gateway_invoice_id: gatewayInvoiceId 
    };
  } catch (err) {
    throw new Error('[Xendit] ' + (err.response?.data?.message || err.message));
  }
}

async function cancelTransaction(invoiceNumber, config, originalRequestId, gatewayInvoiceId) {
  const { secretKey } = config;
  if (!secretKey) return false;
  
  // Prefer the official gateway invoice ID, fallback to external ID
  const targetId = gatewayInvoiceId || invoiceNumber;
  try {
    await axios.post(`https://api.xendit.co/v2/invoices/${targetId}/expire!`, {}, {
      auth: { username: secretKey, password: '' }
    });
    return true;
  } catch (err) {
    console.error('[Xendit Cancel] failed:', err.response?.data || err.message);
    return false;
  }
}

function verifyWebhook(payload, headers, config) {
  const callbackToken = headers['x-callback-token'] || '';
  const expectedToken = config.settings?.xendit_webhook_secret || process.env.XENDIT_WEBHOOK_TOKEN || '';
  
  // Verify token unless in non-production local development without a token
  let is_valid = false;
  if (process.env.NODE_ENV !== 'production' && !expectedToken) {
    is_valid = true;
  } else {
    is_valid = (callbackToken === expectedToken);
  }
  
  const transaction_status = payload?.status || 'UNKNOWN';
  const invoice_number = payload?.external_id || '';

  return { is_valid, transaction_status, invoice_number };
}

module.exports = { 
  createTransaction, 
  cancelTransaction, 
  verifyWebhook 
};
