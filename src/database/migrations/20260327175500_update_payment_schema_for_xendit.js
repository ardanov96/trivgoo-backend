/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Ensure payment_request_id exists on bookings, since the seeder might not have run on all environments
  const hasPaymentRequestId = await knex.schema.hasColumn('bookings', 'payment_request_id');
  if (!hasPaymentRequestId) {
    await knex.schema.alterTable('bookings', table => {
      table.string('payment_request_id', 100).nullable().comment('Original request ID for legacy DOKU cancel');
    });
  }

  // 2. Change the default selected_gateway in payment_settings to 'xendit'
  await knex.raw("ALTER TABLE payment_settings MODIFY COLUMN selected_gateway ENUM('xendit','doku') NOT NULL DEFAULT 'xendit'");
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Revert the default selected_gateway back to 'doku'
  await knex.raw("ALTER TABLE payment_settings MODIFY COLUMN selected_gateway ENUM('xendit','doku') NOT NULL DEFAULT 'doku'");
  
  // We don't drop payment_request_id actively because legacy seeders might have relied on it
};
