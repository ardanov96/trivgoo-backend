/**
 * Migration: Create webhook_logs table
 * Logs all webhook/notification events from payment gateways
 * Useful for debugging and auditing
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('webhook_logs', (table) => {
    // 1. Primary Key
    table.increments('id').primary();
    
    // 2. Gateway Identifier
    table.enum('gateway', ['xendit', 'midtrans'])
      .notNullable()
      .comment('Payment gateway source');
    
    // 3. Event Details
    table.string('event_type', 100).notNullable()
      .comment('Type of event (e.g., invoice.paid, transaction.settlement)');
    
    table.string('external_id').nullable()
      .comment('Order/Booking ID from webhook payload');
    
    table.string('transaction_id').nullable()
      .comment('Gateway transaction ID');
    
    // 4. Webhook Data
    table.json('payload').notNullable()
      .comment('Full webhook payload (raw JSON)');
    
    table.json('headers').nullable()
      .comment('HTTP headers from webhook request');
    
    // 5. Processing Status
    table.enum('status', ['pending', 'processed', 'failed'])
      .defaultTo('pending')
      .notNullable()
      .comment('Processing status');
    
    table.string('error_message', 1000).nullable()
      .comment('Error message if processing failed');
    
    // 6. Verification
    table.boolean('signature_verified')
      .defaultTo(false)
      .comment('Whether webhook signature was verified');
    
    // 7. Processing Time
    table.timestamp('processed_at').nullable()
      .comment('When webhook was processed');
    
    table.integer('retry_count').defaultTo(0)
      .comment('Number of processing retries');
    
    // 8. Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // 9. Indexes for searching and monitoring
    table.index(['gateway', 'created_at']);
    table.index(['external_id']);
    table.index(['transaction_id']);
    table.index(['status']);
    table.index(['event_type']);
    table.index(['created_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('webhook_logs');
};