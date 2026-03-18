/**
 * Migration: create_product_vouchers_table
 * Pivot table — relasi many-to-many antara products dan vouchers.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('product_vouchers').then((exists) => {
    if (exists) return; // tabel sudah ada, skip
    return knex.schema.createTable('product_vouchers', (table) => {
      table.bigInteger('product_id').unsigned().notNullable();
      table.integer('voucher_id').unsigned().notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.primary(['product_id', 'voucher_id']);

      table.foreign('product_id')
        .references('id')
        .inTable('products')
        .onDelete('CASCADE');

      table.foreign('voucher_id')
        .references('id')
        .inTable('vouchers')
        .onDelete('CASCADE');

      table.index('product_id', 'idx_product_vouchers_product_id');
      table.index('voucher_id', 'idx_product_vouchers_voucher_id');
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('product_vouchers');
};