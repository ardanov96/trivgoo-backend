/**
 * Migration: Add payment fields to bookings table
 * Adds payment status and related fields to existing bookings table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('bookings', (table) => {
    // 1. Payment Status
    table.enum('payment_status', [
      'PENDING',
      'PAID',
      'EXPIRED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'CHALLENGE'
    ]).defaultTo('PENDING')
      .comment('Current payment status');
    
    // 2. Payment Gateway Used
    table.enum('payment_gateway', ['xendit', 'midtrans'])
      .nullable()
      .comment('Gateway used for this booking');
    
    // 3. Payment Timestamps
    table.timestamp('paid_at').nullable()
      .comment('When payment was completed');
    
    table.timestamp('payment_expires_at').nullable()
      .comment('Payment deadline');
    
    // 4. Payment Instructions (for VA, etc)
    table.json('payment_instructions').nullable()
      .comment('Payment instructions (VA number, bank code, etc)');
    
    // 5. Add index for payment_status
    table.index(['payment_status']);
    table.index(['payment_gateway', 'payment_status']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('bookings', (table) => {
    table.dropColumn('payment_status');
    table.dropColumn('payment_gateway');
    table.dropColumn('paid_at');
    table.dropColumn('payment_expires_at');
    table.dropColumn('payment_instructions');
  });
};