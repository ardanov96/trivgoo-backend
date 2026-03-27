// src/services/payment/index.js
const xendit = require('./gateways/xendit');
const doku = require('./gateways/doku');
const status_mapper = require('./status_mapper');
const config_resolver = require('./config_resolver');

function getGatewayModule(gatewayName) {
  if (gatewayName === 'xendit') return xendit;
  if (gatewayName === 'doku') return doku;
  throw new Error(`Unsupported payment gateway: ${gatewayName}`);
}

module.exports = {
  getGatewayModule,
  xendit,
  doku,
  status_mapper,
  config_resolver
};
