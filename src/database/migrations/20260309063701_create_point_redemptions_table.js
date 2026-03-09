/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('point_redemptions', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.integer('points_spent').notNullable();

    table.enu('redemption_type', [
      'voucher',
      'checkout',
    ]).notNullable();

    table.integer('voucher_id').unsigned().nullable();
    table.decimal('voucher_value', 10, 2).nullable();

    table.integer('order_id').unsigned().nullable();
    table.decimal('discount_amount', 10, 2).nullable();

    table.enu('status', ['pending', 'used', 'cancelled', 'expired'])
      .notNullable().defaultTo('pending');

    table.datetime('expires_at').nullable();

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.foreign('voucher_id')
      .references('id')
      .inTable('vouchers')
      .onDelete('SET NULL');

    table.index('user_id', 'idx_point_redemptions_user_id');
    table.index('status', 'idx_point_redemptions_status');
    table.index('voucher_id', 'idx_point_redemptions_voucher_id');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('point_redemptions');
};