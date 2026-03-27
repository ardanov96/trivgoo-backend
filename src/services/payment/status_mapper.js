// src/services/payment/status_mapper.js

function mapXenditStatus(status) {
  const map = {
    'PENDING': 'PENDING',
    'PAID': 'PAID',
    'SETTLED': 'PAID',
    'EXPIRED': 'EXPIRED',
    'FAILED': 'FAILED'
  };
  return map[status?.toUpperCase()] || 'PENDING';
}

function mapDokuStatus(status) {
  const map = {
    'SUCCESS': 'PAID',
    'PAID': 'PAID',
    'PENDING': 'PENDING',
    'FAILED': 'FAILED',
    'EXPIRED': 'EXPIRED',
    'CANCELLED': 'CANCELLED',
    'REFUNDED': 'REFUNDED',
    'VOIDED': 'CANCELLED'
  };
  return map[status?.toUpperCase()] || 'PENDING';
}

module.exports = {
  mapXenditStatus, 
  mapDokuStatus
};
