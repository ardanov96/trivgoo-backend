/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('voucher_restrictions', (table) => {
    table.increments('id').primary();
    table.integer('voucher_id').unsigned().notNullable();

    table.enu('type', [
      'blacklist_user',
      'whitelist_user',
      'blacklist_product',
      'blacklist_category',
      'min_membership_tier',
    ]).notNullable();

    table.integer('ref_id').unsigned().nullable();
    table.text('note').nullable();
    table.timestamps(true, true);

    table.foreign('voucher_id')
      .references('id')
      .inTable('vouchers')
      .onDelete('CASCADE');

    table.index('voucher_id', 'idx_voucher_restrictions_voucher_id');
    table.index(['voucher_id', 'type'], 'idx_voucher_restrictions_type');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('voucher_restrictions');
};