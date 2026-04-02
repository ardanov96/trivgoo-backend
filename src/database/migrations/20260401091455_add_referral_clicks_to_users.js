/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'referral_clicks');
  if (!hasColumn) {
    await knex.schema.alterTable('users', function(table) {
      table.integer('referral_clicks').unsigned().notNullable().defaultTo(0);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('users', function(table) {
    table.dropColumn('referral_clicks');
  });
};
