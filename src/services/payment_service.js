// src/services/payment_service.js
// Backward-compatibility wrapper delegating to modular strategy pattern

const payment = require('./payment'); // loads index.js
const { getGatewayConfig } = require('./payment/config_resolver');

/**
 * createTransaction wrapper
 * Dispatches to active default gateway
 */
const createTransaction = async (order, forcedGateway = null) => {
  const config = await getGatewayConfig(forcedGateway);
  const provider = payment.getGatewayModule(config.gateway);
  
  console.log(`[PaymentService] Delegating createTransaction to ${config.gateway}`);
  return await provider.createTransaction(order, config);
};

/**
 * cancelTransaction wrapper
 * Looks up config based on forced gateway or system default
 */
const cancelTransaction = async (invoiceNumber, gateway = null, originalRequestId = null, gatewayInvoiceId = null) => {
  const config = await getGatewayConfig(gateway);
  const provider = payment.getGatewayModule(config.gateway);
  
  console.log(`[PaymentService] Delegating cancelTransaction for ${invoiceNumber} to ${config.gateway}`);
  return await provider.cancelTransaction(invoiceNumber, config, originalRequestId, gatewayInvoiceId);
};

/**
 * handleNotification wrapper
 * By default, attempts to identify gateway via config fallback, though it's
 * better handled via explicit routing in Phase 4. Keep for legacy compatibility.
 */
const handleNotification = async (notification, headers = {}, forcedGateway = null) => {
  const config = await getGatewayConfig(forcedGateway);
  const provider = payment.getGatewayModule(config.gateway);
  
  // Verification returns { is_valid, transaction_status, invoice_number }
  const result = provider.verifyWebhook(notification, headers, config);
  
  if (!result.is_valid) {
    throw new Error(`Invalid webhook signature for gateway: ${config.gateway}`);
  }
  
  return result;
};

// Expose legacy helpers for internal references if any exist
const { getTimestampUTC, generateJokulDigest, generateJokulSignature } = payment.doku;

module.exports = {
  createTransaction,
  cancelTransaction,
  handleNotification,
  getActiveGatewayConfig: getGatewayConfig,
  getTimestampUTC,
  generateJokulSignature,
  generateJokulDigest,
};