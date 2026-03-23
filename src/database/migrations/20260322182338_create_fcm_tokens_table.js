/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('fcm_tokens', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable(); // Relasi ke user
    table.string('token', 255).notNullable().unique(); // Token FCM
    table.string('device_type', 50).nullable(); // web / ios / android
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

    // Opsional: Foreign key constraint jika ada tabel users
    // table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('fcm_tokens');
};
