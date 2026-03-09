exports.up = function (knex) {
    return knex.schema.alterTable('users', function (table) {
        table.string('phone_number', 20).nullable().after('email');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('users', function (table) {
        table.dropColumn('phone_number');
    });
};
