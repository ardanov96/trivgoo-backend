/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('referral_usages', (table) => {
    table.increments('id').primary();
    table.integer('referral_code_id').unsigned().notNullable();
    table.bigInteger('referrer_id').unsigned().notNullable();
    table.bigInteger('referee_id').unsigned().notNullable();

    table.tinyint('referrer_rewarded').notNullable().defaultTo(0);
    table.tinyint('referee_rewarded').notNullable().defaultTo(0);

    table.integer('qualifying_order_id').unsigned().nullable();
    table.decimal('qualifying_order_amount', 14, 2).nullable();

    table.enu('status', ['pending', 'qualified', 'rewarded', 'cancelled'])
      .notNullable().defaultTo('pending');

    table.unique(['referee_id'], { indexName: 'uq_referral_usages_referee' });

    table.foreign('referral_code_id')
      .references('id')
      .inTable('referral_codes')
      .onDelete('CASCADE');

    table.foreign('referrer_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.foreign('referee_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.index('referral_code_id', 'idx_referral_usages_code_id');
    table.index('referrer_id', 'idx_referral_usages_referrer_id');
    table.index('referee_id', 'idx_referral_usages_referee_id');
    table.index('status', 'idx_referral_usages_status');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('referral_usages');
};