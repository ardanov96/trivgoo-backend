/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('bookings', (table) => {
    // 1. Identitas Utama
    table.increments('id').primary(); // Muncul sebagai #id di dashboard
    
    // 2. Relasi (Sesuaikan nama tabel referensi jika berbeda)
    table.integer('user_id').unsigned().nullable(); 
    table.integer('product_id').unsigned().nullable();

    // 3. Data Snapshot (Penting agar data di dashboard tetap konsisten meskipun nama produk/user berubah)
    table.string('user_name').notNullable(); // {booking.userName}
    table.string('product_name').notNullable(); // {booking.productName}
    table.integer('quantity').defaultTo(1); // Qty: {booking.quantity}
    table.decimal('total_price', 15, 2).notNullable(); // ${booking.totalPrice}
    
    // 4. Jadwal Aktivitas
    table.date('date').notNullable(); // {booking.date}

    // 5. Status Manajemen (Sesuai Enum BookingStatus di Frontend)
    table.enum('status', ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
      .defaultTo('PENDING')
      .notNullable();

    // -------------------------------------------------------
    // PAYMENT GATEWAY INTEGRATION (Midtrans & Xendit)
    // -------------------------------------------------------
    
    // ID Unik untuk dikirim ke gateway (Midtrans: order_id, Xendit: external_id)
    table.string('external_id').unique().notNullable(); 
    
    // Menyimpan URL pembayaran (Misal: Invoice URL Xendit atau Snap Redirect Midtrans)
    table.string('payment_url').nullable();
    
    // Menyimpan Token (Misal: Midtrans Snap Token)
    table.string('payment_token').nullable();
    
    // Menyimpan metode yang dipilih user nantinya (misal: 'bank_transfer', 'credit_card', 'ewallet')
    table.string('payment_method').nullable();

    // 6. Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexing untuk pencarian cepat di dashboard (ID, User, Product)
    table.index(['external_id', 'status', 'user_name']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('bookings');
};