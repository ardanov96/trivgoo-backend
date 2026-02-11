'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Ambil data user dan product yang sudah ada untuk referensi ID
    const [users] = await queryInterface.sequelize.query('SELECT id, name FROM users');
    const [products] = await queryInterface.sequelize.query('SELECT id, name, price FROM products');

    if (users.length === 0 || products.length === 0) {
      console.error('Data users atau products kosong. Silakan isi tabel tersebut dulu!');
      return;
    }

    const statuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
    const dummyBookings = [];

    for (let i = 0; i < 100; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randomProduct = products[Math.floor(Math.random() * products.length)];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
      
      const qty = Math.floor(Math.random() * 5) + 1;
      const totalPrice = parseFloat(randomProduct.price) * qty;

      // Tanggal acak dalam 30 hari terakhir
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));

      dummyBookings.push({
        user_id: randomUser.id,
        product_id: randomProduct.id,
        product_name: randomProduct.name,
        user_name: randomUser.name,
        quantity: qty,
        total_price: totalPrice,
        date: date.toISOString().split('T')[0],
        status: randomStatus,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    return queryInterface.bulkInsert('bookings', dummyBookings, {});
  },

  async down(queryInterface, Sequelize) {
    // Menghapus semua data dari tabel bookings saat undo
    return queryInterface.bulkDelete('bookings', null, {});
  }
};