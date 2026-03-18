/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('settings', (table) => {
    table.increments('id').primary(); 
    table.string('site_name').defaultTo('Trivgoo Travel');
    table.string('support_email').defaultTo('cs@trivgoo.com');
    table.boolean('maintenance_mode').defaultTo(false);
    table.integer('commission_rate').defaultTo(11);
    table.string('currency', 10).defaultTo('USD');
    table.string('payout_schedule').defaultTo('weekly');
    table.boolean('require_2fa').defaultTo(true);
    table.integer('session_timeout').defaultTo(30);
    table.timestamps(true, true); 
  }).then(() => {
    return knex('settings').insert({
      id: 1,
      site_name: 'Trivgoo Travel',
      commission_rate: 11
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('settings');
};