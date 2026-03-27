// src/services/payment/gateways/doku.js
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function getTimestampUTC() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function generateJokulDigest(bodyString) {
  const raw = crypto.createHash('sha256').update(bodyString, 'utf-8').digest();
  return Buffer.from(raw).toString('base64');
}

function generateJokulSignature(clientId, requestId, timestamp, requestTarget, digest, secretKey) {
  let component = 'Client-Id:' + clientId;
  component += '\nRequest-Id:' + requestId;
  component += '\nRequest-Timestamp:' + timestamp;
  component += '\nRequest-Target:' + requestTarget;
  if (digest) component += '\nDigest:' + digest;

  const hmacRaw = crypto.createHmac('sha256', secretKey).update(component).digest();
  return 'HMACSHA256=' + Buffer.from(hmacRaw).toString('base64');
}

function sanitizeDokuString(str, maxLength = 255) {
  if (!str) return '-';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-\/+,=_:'@% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

async function createTransaction(order, config) {
  const { clientId, secretKey, baseUrl } = config;
  
  if (process.env.DOKU_MOCK === 'true') {
    return {
      payment_url: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/payment/result?invoice=' + order.id,
      invoice_number: order.id,
      request_id: uuidv4()
    };
  }

  const amount = Math.round(Number(order.amount));
  const requestId = uuidv4();
  const timestamp = getTimestampUTC();
  const requestTarget = '/checkout/v1/payment';
  const callbackUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/payment/result?invoice=' + order.id;
  const paymentDueMinutes = 1440;

  const safeProductName = sanitizeDokuString(order.product_name || 'Trivgoo Booking');
  const safeCustomerName = sanitizeDokuString(order.name || 'Customer');

  const requestBody = {
    order: {
      amount, 
      invoice_number: order.id, 
      currency: 'IDR', 
      callback_url: callbackUrl,
      line_items: [{ name: safeProductName + ' - x1', price: amount, quantity: 1 }]
    },
    payment: { payment_due_date: paymentDueMinutes },
    customer: { name: safeCustomerName, email: order.email || 'customer@example.com' }
  };

  const bodyString = JSON.stringify(requestBody);
  const signature = generateJokulSignature(clientId, requestId, timestamp, requestTarget, generateJokulDigest(bodyString), secretKey);

  try {
    const response = await axios.post(baseUrl + requestTarget, requestBody, {
      headers: { 'Client-Id': clientId, 'Request-Id': requestId, 'Request-Timestamp': timestamp, 'Signature': signature, 'Content-Type': 'application/json' }
    });
    
    const paymentUrl = response.data?.response?.payment?.url || response.data?.payment?.url || response.data?.url;
    if (!paymentUrl) throw new Error('DOKU missing payment URL');
    
    return { 
      payment_url: paymentUrl, 
      invoice_number: order.id, 
      request_id: requestId 
    };
  } catch (err) {
    throw new Error('[DOKU] ' + (err.response?.data?.message || err.message));
  }
}

async function cancelTransaction(invoiceNumber, config, originalRequestId, gatewayInvoiceId) {
  const { clientId, secretKey, baseUrl } = config;
  if (!clientId || !secretKey) return false;
  
  const requestTarget = '/checkout/v3/cancellations';
  const requestId = uuidv4();
  const timestamp = getTimestampUTC();

  const requestBody = {
    client: { id: clientId },
    order: { invoice_number: invoiceNumber },
    payment: { original_request_id: originalRequestId || invoiceNumber },
    cancel: { reason: 'RESTOCK' },
    note: 'Pembatalan pesanan Trivgoo'
  };

  try {
    await axios.post(baseUrl + requestTarget, requestBody, {
      headers: {
        'Client-Id': clientId, 'Request-Id': requestId, 'Request-Timestamp': timestamp,
        'Signature': generateJokulSignature(clientId, requestId, timestamp, requestTarget, generateJokulDigest(JSON.stringify(requestBody)), secretKey),
        'Content-Type': 'application/json'
      }
    });
    return true;
  } catch (err) {
    console.error('[DOKU Cancel] failed:', err.response?.data || err.message);
    return false;
  }
}

function verifyWebhook(payload, headers, config, routingPath = '/api/v1/payment/notification') {
  const { clientId, secretKey } = config;
  
  const incomingSignature = headers['signature'] || headers['Signature'] || '';
  const requestId = headers['request-id'] || headers['Request-Id'] || '';
  const timestamp = headers['request-timestamp'] || headers['Request-Timestamp'] || '';
  
  // Ensure the route matches what DOKU was configured to call
  const digest = generateJokulDigest(JSON.stringify(payload));
  const expectedSignature = generateJokulSignature(clientId, requestId, timestamp, routingPath, digest, secretKey);

  let is_valid = false;
  if (process.env.NODE_ENV !== 'production' && !incomingSignature) {
    is_valid = true;
  } else {
    is_valid = (incomingSignature === expectedSignature);
  }

  const transaction_status = payload?.transaction?.status || payload?.service?.status || 'UNKNOWN';
  const invoice_number = payload?.order?.invoice_number || payload?.invoice_number || '';

  return { is_valid, transaction_status, invoice_number };
}

module.exports = { 
  createTransaction, 
  cancelTransaction, 
  verifyWebhook,
  getTimestampUTC,
  generateJokulDigest,
  generateJokulSignature
};
