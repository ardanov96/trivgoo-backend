/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('point_transactions', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().notNullable();

    table.enu('type', [
      'earn_purchase',
      'earn_referral',
      'earn_review',
      'earn_birthday',
      'earn_campaign',
      'spend_redemption',
      'spend_checkout',
      'expired',
      'adjustment',
    ]).notNullable();

    table.integer('points').notNullable();
    table.integer('balance_after').notNullable();

    table.string('ref_type', 50).nullable();
    table.integer('ref_id').nullable();

    table.text('note').nullable();
    table.datetime('expires_at').nullable();

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.index('user_id', 'idx_point_transactions_user_id');
    table.index(['user_id', 'type'], 'idx_point_transactions_user_type');
    table.index('expires_at', 'idx_point_transactions_expires_at');
    table.index(['ref_type', 'ref_id'], 'idx_point_transactions_ref');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('point_transactions');
};