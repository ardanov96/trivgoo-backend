/**
 * Migration: Create payment_settings table
 * Stores configuration for payment gateways (Xendit & Midtrans)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('payment_settings', (table) => {
    // 1. Primary Key
    table.increments('id').primary();
    
    // 2. Gateway Selection
    table.enum('selected_gateway', ['xendit', 'midtrans'])
      .defaultTo('xendit')
      .notNullable()
      .comment('Active payment gateway');
    
    // 3. Environment Mode
    table.boolean('is_test_mode')
      .defaultTo(true)
      .notNullable()
      .comment('Sandbox/Test mode or Production');
    
    // -------------------------------------------------------
    // XENDIT CONFIGURATION
    // -------------------------------------------------------
    table.text('xendit_api_key').nullable()
      .comment('Xendit API Key (encrypted in production)');
    
    table.string('xendit_webhook_url', 500).nullable()
      .comment('Xendit webhook endpoint URL');
    
    table.text('xendit_webhook_secret').nullable()
      .comment('Xendit webhook verification token');
    
    table.json('xendit_payment_methods').nullable()
      .comment('Enabled Xendit payment methods as JSON array');
    
    // -------------------------------------------------------
    // MIDTRANS CONFIGURATION
    // -------------------------------------------------------
    table.text('midtrans_server_key').nullable()
      .comment('Midtrans Server Key (encrypted in production)');
    
    table.text('midtrans_client_key').nullable()
      .comment('Midtrans Client Key for frontend');
    
    table.string('midtrans_webhook_url', 500).nullable()
      .comment('Midtrans notification endpoint URL');
    
    table.json('midtrans_payment_methods').nullable()
      .comment('Enabled Midtrans payment methods as JSON array');
    
    // -------------------------------------------------------
    // STATUS & METADATA
    // -------------------------------------------------------
    table.boolean('is_active')
      .defaultTo(true)
      .notNullable()
      .comment('Is this configuration active');
    
    table.json('metadata').nullable()
      .comment('Additional configuration data');
    
    // 4. Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // 5. Indexes
    table.index(['is_active', 'selected_gateway']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payment_settings');
};