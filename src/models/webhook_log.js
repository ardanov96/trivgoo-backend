const db = require('../configs/db');

const WebhookLog = {
  logIncoming: async (gateway, eventType, externalId, payload) => {
    const [result] = await db.execute(
      `INSERT INTO webhook_logs (gateway, event_type, external_id, payload, signature_verified, status) 
       VALUES (?, ?, ?, ?, true, 'pending')`,
      [gateway, eventType, externalId, JSON.stringify(payload)]
    );
    return result;
  },

  markProcessed: async (externalId, gateway) => {
    return await db.execute(
      `UPDATE webhook_logs SET status = 'processed', processed_at = NOW() 
       WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`,
      [externalId, gateway]
    );
  },

  markFailed: async (externalId, gateway, errorMessage, needsRefund = false) => {
    const status = needsRefund ? 'needs_refund' : 'failed';
    return await db.execute(
      `UPDATE webhook_logs SET status = ?, error_message = ?, processed_at = NOW() 
       WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`,
      [status, errorMessage, externalId, gateway]
    );
  }
};

module.exports = WebhookLog;
