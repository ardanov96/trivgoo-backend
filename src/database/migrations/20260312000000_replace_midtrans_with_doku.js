/**
 * Migration: Replace Midtrans with DOKU
 * - payment_settings: add doku_* columns, update enum (midtrans columns may not exist)
 * - payment_transactions: update gateway enum
 * - bookings: update payment_gateway enum
 * - webhook_logs: update gateway enum
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // -------------------------------------------------------
  // 1. payment_settings — conditionally drop midtrans columns, add doku columns
  // -------------------------------------------------------

  // Check which midtrans columns exist before trying to drop
  const [columns] = await knex.raw('SHOW COLUMNS FROM payment_settings');
  const columnNames = columns.map(c => c.Field);

  await knex.schema.alterTable('payment_settings', (table) => {
    // Drop Midtrans columns only if they exist
    if (columnNames.includes('midtrans_server_key')) table.dropColumn('midtrans_server_key');
    if (columnNames.includes('midtrans_client_key')) table.dropColumn('midtrans_client_key');
    if (columnNames.includes('midtrans_webhook_url')) table.dropColumn('midtrans_webhook_url');
    if (columnNames.includes('midtrans_payment_methods')) table.dropColumn('midtrans_payment_methods');
    if (columnNames.includes('midtrans_merchant_id')) table.dropColumn('midtrans_merchant_id');
  });

  // Step 1: Expand enum to include both values
  await knex.raw(
    "ALTER TABLE payment_settings MODIFY COLUMN selected_gateway ENUM('xendit','midtrans','doku') NOT NULL DEFAULT 'doku'"
  );
  // Step 2: Update existing data
  await knex.raw("UPDATE payment_settings SET selected_gateway = 'doku' WHERE selected_gateway = 'midtrans'");
  // Step 3: Shrink enum
  await knex.raw(
    "ALTER TABLE payment_settings MODIFY COLUMN selected_gateway ENUM('xendit','doku') NOT NULL DEFAULT 'doku'"
  );

  // Add DOKU columns (only if they don't already exist)
  const [columnsAfter] = await knex.raw('SHOW COLUMNS FROM payment_settings');
  const columnNamesAfter = columnsAfter.map(c => c.Field);

  await knex.schema.alterTable('payment_settings', (table) => {
    if (!columnNamesAfter.includes('doku_client_id')) {
      table.text('doku_client_id').nullable()
        .comment('DOKU Client ID from dashboard');
    }
    if (!columnNamesAfter.includes('doku_secret_key')) {
      table.text('doku_secret_key').nullable()
        .comment('DOKU Secret Key (encrypted in production)');
    }
    if (!columnNamesAfter.includes('doku_webhook_url')) {
      table.string('doku_webhook_url', 500).nullable()
        .comment('DOKU notification/callback URL');
    }
    if (!columnNamesAfter.includes('doku_payment_methods')) {
      table.json('doku_payment_methods').nullable()
        .comment('Enabled DOKU payment methods as JSON array');
    }
  });

  // -------------------------------------------------------
  // 2. payment_transactions — update gateway enum
  // -------------------------------------------------------
  await knex.raw(
    "ALTER TABLE payment_transactions MODIFY COLUMN gateway ENUM('xendit','midtrans','doku') NOT NULL"
  );
  await knex.raw("UPDATE payment_transactions SET gateway = 'doku' WHERE gateway = 'midtrans'").catch(() => {});
  await knex.raw(
    "ALTER TABLE payment_transactions MODIFY COLUMN gateway ENUM('xendit','doku') NOT NULL"
  );

  // -------------------------------------------------------
  // 3. bookings — update payment_gateway enum
  // -------------------------------------------------------
  await knex.raw(
    "ALTER TABLE bookings MODIFY COLUMN payment_gateway ENUM('xendit','midtrans','doku') NULL"
  );
  await knex.raw("UPDATE bookings SET payment_gateway = 'doku' WHERE payment_gateway = 'midtrans'").catch(() => {});
  await knex.raw(
    "ALTER TABLE bookings MODIFY COLUMN payment_gateway ENUM('xendit','doku') NULL"
  );

  // -------------------------------------------------------
  // 4. webhook_logs — update gateway enum
  // -------------------------------------------------------
  await knex.raw(
    "ALTER TABLE webhook_logs MODIFY COLUMN gateway ENUM('xendit','midtrans','doku') NOT NULL"
  );
  await knex.raw("UPDATE webhook_logs SET gateway = 'doku' WHERE gateway = 'midtrans'").catch(() => {});
  await knex.raw(
    "ALTER TABLE webhook_logs MODIFY COLUMN gateway ENUM('xendit','doku') NOT NULL"
  );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Revert payment_settings
  const [columns] = await knex.raw('SHOW COLUMNS FROM payment_settings');
  const columnNames = columns.map(c => c.Field);

  await knex.schema.alterTable('payment_settings', (table) => {
    if (columnNames.includes('doku_client_id')) table.dropColumn('doku_client_id');
    if (columnNames.includes('doku_secret_key')) table.dropColumn('doku_secret_key');
    if (columnNames.includes('doku_webhook_url')) table.dropColumn('doku_webhook_url');
    if (columnNames.includes('doku_payment_methods')) table.dropColumn('doku_payment_methods');
  });

  await knex.raw(
    "ALTER TABLE payment_settings MODIFY COLUMN selected_gateway ENUM('xendit','midtrans') NOT NULL DEFAULT 'xendit'"
  );

  // Revert payment_transactions
  await knex.raw(
    "ALTER TABLE payment_transactions MODIFY COLUMN gateway ENUM('xendit','midtrans') NOT NULL"
  );

  // Revert bookings
  await knex.raw(
    "ALTER TABLE bookings MODIFY COLUMN payment_gateway ENUM('xendit','midtrans') NULL"
  );

  // Revert webhook_logs
  await knex.raw(
    "ALTER TABLE webhook_logs MODIFY COLUMN gateway ENUM('xendit','midtrans') NOT NULL"
  );
};
