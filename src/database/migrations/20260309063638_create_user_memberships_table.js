/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('user_memberships', (table) => {
    table.increments('id').primary();
    table.bigInteger('user_id').unsigned().notNullable().unique();
    table.integer('tier_id').unsigned().notNullable();

    table.decimal('total_spending', 14, 2).notNullable().defaultTo(0);
    table.integer('total_points_earned').notNullable().defaultTo(0);

    table.datetime('tier_achieved_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('tier_expires_at').nullable();

    table.foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.foreign('tier_id')
      .references('id')
      .inTable('membership_tiers')
      .onDelete('RESTRICT');

    table.index('user_id', 'idx_user_memberships_user_id');
    table.index('tier_id', 'idx_user_memberships_tier_id');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('user_memberships');
};