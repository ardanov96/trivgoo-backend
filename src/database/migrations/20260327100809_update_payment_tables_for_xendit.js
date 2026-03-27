/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Update ENUMs safely via raw SQL to include 'doku' and 'needs_refund'
  await knex.raw(`ALTER TABLE payment_transactions MODIFY COLUMN gateway ENUM('xendit', 'midtrans', 'doku') NOT NULL`);
  await knex.raw(`ALTER TABLE webhook_logs MODIFY COLUMN gateway ENUM('xendit', 'midtrans', 'doku') NOT NULL`);
  await knex.raw(`ALTER TABLE webhook_logs MODIFY COLUMN status ENUM('pending', 'processed', 'failed', 'needs_refund') NOT NULL DEFAULT 'pending'`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // We don't shrink ENUMs in down migration to avoid data truncation errors
  // if 'doku' or 'needs_refund' data exists.
  return Promise.resolve();
};
