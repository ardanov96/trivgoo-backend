/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.raw(
    "ALTER TABLE bookings MODIFY COLUMN payment_gateway ENUM('xendit', 'midtrans', 'doku') NULL COMMENT 'Gateway used for this booking'"
  );
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function() {
  // Intentionally left as no-op to avoid truncation if doku data already exists.
  return Promise.resolve();
};
