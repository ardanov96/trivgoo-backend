/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('point_balances', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().notNullable().unique();

    table.integer('balance').notNullable().defaultTo(0);
    table.integer('lifetime_earned').notNullable().defaultTo(0);
    table.integer('lifetime_spent').notNullable().defaultTo(0);
    table.integer('lifetime_expired').notNullable().defaultTo(0);

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.index('user_id', 'idx_point_balances_user_id');
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('point_balances');
};