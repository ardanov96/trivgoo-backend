exports.up = function (knex) {
    return knex.schema.createTable('email_verifications', (table) => {
        table.increments('id').primary();
        table.string('email').notNullable();
        table.string('token').notNullable();
        table.dateTime('expires_at').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists('email_verifications');
};
