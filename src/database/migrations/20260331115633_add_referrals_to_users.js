/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasRefCode = await knex.schema.hasColumn('users', 'referral_code');
  if (!hasRefCode) {
    await knex.schema.alterTable('users', function(table) {
      table.string('referral_code', 15).unique().nullable();
    });
  }
  
  const hasRefById = await knex.schema.hasColumn('users', 'referred_by_id');
  if (!hasRefById) {
    await knex.schema.alterTable('users', function(table) {
      table.integer('referred_by_id').unsigned().nullable();
      table.foreign('referred_by_id').references('users.id').onDelete('SET NULL');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('users', function(table) {
    table.dropForeign('referred_by_id');
    table.dropColumn('referred_by_id');
    table.dropColumn('referral_code');
  });
};
