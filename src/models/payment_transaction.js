const db = require('../configs/db');

const PaymentTransaction = {
  create: async (data) => {
    return await db.execute("INSERT INTO payment_transactions SET ?", [data]);
  },
  
  updateStatus: async (externalId, gateway, status, gatewayResponse) => {
    return await db.execute(
      `UPDATE payment_transactions 
       SET status = ?, gateway_response = ?, paid_at = IF(? = 'PAID', NOW(), paid_at), updated_at = NOW() 
       WHERE external_id = ? AND gateway = ?`,
      [status, JSON.stringify(gatewayResponse), status, externalId, gateway]
    );
  },

  findByExternalId: async (externalId, gateway) => {
    const [rows] = await db.query(
      `SELECT * FROM payment_transactions WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`,
      [externalId, gateway]
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  },

  findLatestByExternalId: async (externalId, gateway) => {
    const [rows] = await db.query(
      `SELECT * FROM payment_transactions WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`,
      [externalId, gateway]
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }
};

module.exports = PaymentTransaction;
