/**
 * Migration: Add reschedule fields to bookings table
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('bookings', (table) => {
    // Tanggal asli sebelum reschedule
    table.date('original_date').nullable()
      .comment('Original date before reschedule');

    // Jumlah kali di-reschedule (max 1)
    table.integer('reschedule_count').defaultTo(0)
      .comment('Number of times this booking has been rescheduled');

    // Waktu terakhir reschedule dilakukan
    table.timestamp('rescheduled_at').nullable()
      .comment('When the last reschedule was performed');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('bookings', (table) => {
    table.dropColumn('original_date');
    table.dropColumn('reschedule_count');
    table.dropColumn('rescheduled_at');
  });
};
