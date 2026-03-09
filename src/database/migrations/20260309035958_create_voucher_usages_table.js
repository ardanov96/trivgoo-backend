/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('voucher_usages', (table) => {
    table.increments('id').primary();
    table.integer('voucher_id').unsigned().notNullable();
    table.bigInteger('user_id').unsigned().notNullable();
    table.integer('order_id').unsigned().nullable();
    table.decimal('original_amount', 10, 2).notNullable();
    table.decimal('discount_amount', 10, 2).notNullable();
    table.decimal('final_amount', 10, 2).notNullable();
    table.timestamp('used_at').defaultTo(knex.fn.now());

    table.unique(['voucher_id', 'user_id'], {
      indexName: 'uq_voucher_usages_user_voucher',
    });

    table.index('voucher_id', 'idx_voucher_usages_voucher_id');
    table.index('user_id', 'idx_voucher_usages_user_id');

    table.foreign('voucher_id')
      .references('id')
      .inTable('vouchers')
      .onDelete('CASCADE');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('voucher_usages');
};