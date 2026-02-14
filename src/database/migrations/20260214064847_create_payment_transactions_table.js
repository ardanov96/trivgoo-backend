/**
 * Migration: Create payment_transactions table
 * Stores all payment transaction records from both gateways
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('payment_transactions', (table) => {
    // 1. Primary Key
    table.increments('id').primary();
    
    // 2. Foreign Keys
    table.integer('booking_id').unsigned().notNullable()
      .comment('Reference to bookings table');
    
    table.integer('user_id').unsigned().nullable()
      .comment('Reference to users table (optional)');
    
    // 3. Gateway Identifier
    table.enum('gateway', ['xendit', 'midtrans'])
      .notNullable()
      .comment('Payment gateway used');
    
    // 4. Transaction Identifiers
    table.string('external_id').notNullable()
      .comment('Order ID sent to gateway (e.g., booking-12345)');
    
    table.string('gateway_transaction_id').nullable()
      .comment('Transaction ID from gateway');
    
    table.string('gateway_invoice_id').nullable()
      .comment('Invoice ID from gateway (Xendit) or Order ID (Midtrans)');
    
    // 5. Amount Details
    table.decimal('amount', 15, 2).notNullable()
      .comment('Transaction amount');
    
    table.string('currency', 3).defaultTo('IDR')
      .comment('Currency code (IDR, USD, etc)');
    
    // 6. Payment Method Details
    table.string('payment_method', 100).nullable()
      .comment('Payment method used (e.g., credit_card, gopay, bca_va)');
    
    table.string('payment_channel', 100).nullable()
      .comment('Specific channel (e.g., BCA, BNI, OVO)');
    
    // 7. Payment URLs
    table.string('payment_url', 1000).nullable()
      .comment('Payment page URL from gateway');
    
    table.string('callback_url', 500).nullable()
      .comment('Success/finish callback URL');
    
    // 8. Transaction Status
    table.enum('status', [
      'PENDING',
      'PAID',
      'SETTLEMENT',
      'EXPIRED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'PARTIAL_REFUND',
      'CHALLENGE'
    ]).defaultTo('PENDING').notNullable()
      .comment('Current transaction status');
    
    table.string('status_message', 500).nullable()
      .comment('Status description from gateway');
    
    table.string('fraud_status', 50).nullable()
      .comment('Fraud detection status (Midtrans)');
    
    // 9. Important Dates
    table.timestamp('paid_at').nullable()
      .comment('When payment was completed');
    
    table.timestamp('settlement_at').nullable()
      .comment('When payment was settled');
    
    table.timestamp('expires_at').nullable()
      .comment('Payment expiration time');
    
    // 10. Gateway Response Data
    table.json('gateway_response').nullable()
      .comment('Full response from gateway (for debugging)');
    
    table.json('payment_details').nullable()
      .comment('Payment details (VA number, QR code, etc)');
    
    // 11. Metadata
    table.json('metadata').nullable()
      .comment('Additional data (customer details, items, etc)');
    
    // 12. Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // 13. Indexes for fast queries
    table.index(['booking_id']);
    table.index(['external_id']);
    table.index(['gateway_transaction_id']);
    table.index(['gateway_invoice_id']);
    table.index(['status']);
    table.index(['gateway', 'status']);
    table.index(['created_at']);
    
    // 14. Unique constraint on external_id + gateway
    table.unique(['external_id', 'gateway']);
    
    // 15. Foreign Key Constraints (optional, uncomment if using FK)
    // table.foreign('booking_id').references('bookings.id').onDelete('CASCADE');
    // table.foreign('user_id').references('users.id').onDelete('SET NULL');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('payment_transactions');
};