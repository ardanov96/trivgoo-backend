/**
 * Migration: Create booking_locks table
 * 
 * Menyimpan soft-lock untuk ketersediaan produk (cart/booking timer)
 * tanpa langsung mengurangi stok permanen.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('booking_locks', (table) => {
    // 1. Primary key
    table.increments('id').primary();

    // 2. Identitas pemilik lock
    table.integer('user_id').unsigned().nullable()
      .comment('User login (jika ada), null untuk guest');

    table.string('cart_token', 64).nullable()
      .comment('Token cart untuk guest (disimpan di localStorage frontend)');

    // 3. Produk & jumlah yang di-lock
    table.integer('product_id').unsigned().notNullable();
    table.integer('quantity').unsigned().notNullable().defaultTo(1);

    // 4. Informasi tanggal (opsional, tergantung jenis produk)
    table.date('start_date').nullable()
      .comment('Tanggal mulai booking / check-in / pickup');
    table.date('end_date').nullable()
      .comment('Tanggal akhir booking / check-out / return');

    // 5. Status lock
    table.enum('status', ['PENDING', 'CONFIRMED', 'RELEASED'])
      .notNullable()
      .defaultTo('PENDING')
      .comment('PENDING = aktif (soft lock), CONFIRMED = sudah jadi booking, RELEASED = dilepas');

    // 6. TTL / Expiry
    table.timestamp('expires_at').notNullable()
      .comment('Waktu kadaluarsa soft lock, setelah ini slot dilepas otomatis secara logis');

    // 7. Metadata tambahan (JSON)
    table.json('metadata').nullable()
      .comment('Data tambahan, misalnya guestCount, dengan sopir, dsb.');

    // 8. Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // 9. Indexes
    table.index(['user_id']);
    table.index(['cart_token']);
    table.index(['product_id']);
    table.index(['status']);
    table.index(['expires_at']);

    // Satu baris aktif per kombinasi (user/cart_token + product + status=PENDING)
    table.unique(['user_id', 'cart_token', 'product_id', 'status'], 'uniq_booking_lock_owner_product_status');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('booking_locks');
};

