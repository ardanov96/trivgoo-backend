/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('vouchers', (table) => {
    table.increments('id').primary();
    table.string('code', 50).notNullable().unique();
    table.string('description', 255).nullable();
    table.enu('type', ['percent', 'fixed']).notNullable().defaultTo('percent');
    table.decimal('value', 10, 2).notNullable();
    table.decimal('max_discount', 10, 2).nullable();
    table.decimal('min_transaction', 10, 2).notNullable().defaultTo(0);
    table.enu('scope', ['all', 'category', 'product']).notNullable().defaultTo('all');
    table.json('scope_ids').nullable();
    table.integer('max_usage').nullable();
    table.integer('used_count').notNullable().defaultTo(0);
    table.tinyint('per_user').notNullable().defaultTo(1);
    table.datetime('starts_at').nullable();
    table.datetime('expires_at').nullable();
    table.tinyint('is_active').notNullable().defaultTo(1);
    table.integer('created_by').nullable();
    table.timestamps(true, true);

    table.index('code', 'idx_vouchers_code');
    table.index('is_active', 'idx_vouchers_is_active');
    table.index('expires_at', 'idx_vouchers_expires_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('vouchers');
};