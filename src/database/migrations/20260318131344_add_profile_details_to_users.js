/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.date('tanggal_lahir').nullable();
    table.string('jenis_kelamin', 20).nullable();
    table.text('tempat_tinggal').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('tanggal_lahir');
    table.dropColumn('jenis_kelamin');
    table.dropColumn('tempat_tinggal');
  });
};
