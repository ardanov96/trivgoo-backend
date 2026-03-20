/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('agent_audit_logs', (table) => {
      table.increments('id');
      table.bigInteger('user_id').unsigned().notNullable();
      table.string('action').notNullable();
      table.text('details').nullable();
      table.string('ip_address').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    })
    .createTable('agent_bank_requests', (table) => {
      table.increments('id');
      table.bigInteger('user_id').unsigned().notNullable();
      table.string('bank_name').notNullable();
      table.string('bank_account_number').notNullable();
      table.string('bank_account_holder').notNullable();
      table.enum('status', ['PENDING_VERIFICATION', 'APPROVED', 'REJECTED']).defaultTo('PENDING_VERIFICATION');
      table.text('rejection_reason').nullable();
      table.bigInteger('reviewed_by').unsigned().nullable();
      table.timestamp('reviewed_at').nullable();
      table.timestamps(true, true);

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('agent_bank_requests')
    .dropTableIfExists('agent_audit_logs');
};
