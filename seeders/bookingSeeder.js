/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Hapus semua data bookings yang ada
  await knex('bookings').del();

  // Ambil data users dan products yang sudah ada
  const users = await knex('users').select('id', 'name');
  const products = await knex('products').select('id', 'name', 'price');

  // Validasi: pastikan ada data users dan products
  if (users.length === 0 || products.length === 0) {
    console.error('❌ Data users atau products kosong. Silakan isi tabel tersebut dulu!');
    console.log(`Users: ${users.length}, Products: ${products.length}`);
    return;
  }

  console.log(`✅ Ditemukan ${users.length} users dan ${products.length} products`);
  console.log('🔄 Generating 500 dummy bookings...');

  const statuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
  const paymentMethods = ['bank_transfer', 'credit_card', 'ewallet', 'qris', 'virtual_account'];
  const dummyBookings = [];

  for (let i = 1; i <= 500; i++) {
    const randomUser = users[Math.floor(Math.random() * users.length)];
    const randomProduct = products[Math.floor(Math.random() * products.length)];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const randomPaymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    
    const qty = Math.floor(Math.random() * 5) + 1; // 1-5 quantity
    const productPrice = parseFloat(randomProduct.price) || 0;
    const totalPrice = productPrice * qty;

    // Generate tanggal acak dalam 60 hari terakhir
    const randomDaysAgo = Math.floor(Math.random() * 60);
    const bookingDate = new Date();
    bookingDate.setDate(bookingDate.getDate() - randomDaysAgo);

    // Generate external_id unik (format: BKG-YYYYMMDD-XXXXX)
    const dateStr = bookingDate.toISOString().split('T')[0].replace(/-/g, '');
    const externalId = `BKG-${dateStr}-${String(i).padStart(5, '0')}`;

    // Conditional: Jika status CONFIRMED atau COMPLETED, buat payment_url dan payment_token
    const hasPayment = randomStatus === 'CONFIRMED' || randomStatus === 'COMPLETED';
    
    dummyBookings.push({
      user_id: randomUser.id,
      product_id: randomProduct.id,
      user_name: randomUser.name,
      product_name: randomProduct.name,
      quantity: qty,
      total_price: totalPrice.toFixed(2),
      date: bookingDate.toISOString().split('T')[0], // Format: YYYY-MM-DD
      status: randomStatus,
      external_id: externalId,
      payment_url: hasPayment ? `https://payment.example.com/invoice/${externalId}` : null,
      payment_token: hasPayment ? `tok_${Math.random().toString(36).substring(2, 15)}` : null,
      payment_method: hasPayment ? randomPaymentMethod : null,
      created_at: bookingDate,
      updated_at: bookingDate
    });

    // Log progress setiap 100 data
    if (i % 100 === 0) {
      console.log(`📝 Generated ${i}/500 bookings...`);
    }
  }

  // Insert data ke database dalam batch
  await knex('bookings').insert(dummyBookings);
  
  console.log('✅ Seeding completed! 500 dummy bookings created.');
};