/**
 * Migration: Rename xendit_api_key to xendit_secret_key in payment_settings
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('payment_settings', (table) => {
      table.renameColumn('xendit_api_key', 'xendit_secret_key');
    });
  };
  
  /**
   * @param { import("knex").Knex } knex
   * @returns { Promise<void> }
   */
  exports.down = function (knex) {
    return knex.schema.alterTable('payment_settings', (table) => {
      table.renameColumn('xendit_secret_key', 'xendit_api_key');
    });
  };