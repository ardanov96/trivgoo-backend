/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('referral_codes', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().notNullable().unique();
    table.string('code', 20).unique().notNullable();

    table.integer('referrer_points').notNullable().defaultTo(0);
    table.decimal('referrer_discount', 10, 2).nullable();

    table.integer('referee_points').notNullable().defaultTo(0);
    table.decimal('referee_discount', 10, 2).nullable();

    table.decimal('min_transaction', 10, 2).notNullable().defaultTo(0);

    table.integer('total_uses').notNullable().defaultTo(0);
    table.integer('max_uses').nullable();
    table.tinyint('is_active').notNullable().defaultTo(1);

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.index('code', 'idx_referral_codes_code');
    table.index('user_id', 'idx_referral_codes_user_id');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('referral_codes');
};