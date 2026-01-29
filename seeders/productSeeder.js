'use strict';

const { pool } = require('../src/configs/db');

async function seedProducts() {
  try {
    console.log('--- Memulai Seeding Produk untuk Agent Trivigo ---');

    // 1. Ambil ID Agent (Gunakan destructuring [rows] untuk mendapatkan hasil query)
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['agent@trivigo.com']);
    
    // Cek apakah rows ada isinya
    if (!rows || rows.length === 0) {
      throw new Error('User agent@trivigo.com tidak ditemukan. Jalankan userSeeder dulu!');
    }
    
    // Gunakan variabel 'rows' yang sudah didefinisikan di atas
    const ownerId = rows[0].id;
    console.log(`--- Ditemukan Owner ID: ${ownerId} ---`);

    // 2. Data Referensi
    const categories = [1, 2, 3];
    const locations = [
      { name: 'Bali', lat: -8.4095, lng: 115.1889 },
      { name: 'Lombok', lat: -8.6500, lng: 116.3500 },
      { name: 'Yogyakarta', lat: -7.7956, lng: 110.3695 },
      { name: 'Jakarta', lat: -6.2088, lng: 106.8456 },
      { name: 'Labuan Bajo', lat: -8.4907, lng: 119.8827 }
    ];

    const products = [];

    // 3. Generate 30 Data Dummy
    for (let i = 1; i <= 30; i++) {
      const categoryId = categories[Math.floor(Math.random() * categories.length)];
      const loc = locations[Math.floor(Math.random() * locations.length)];
      
      const lat = (loc.lat + (Math.random() - 0.5) * 0.1).toFixed(6);
      const lng = (loc.lng + (Math.random() - 0.5) * 0.1).toFixed(6);

      products.push([
        ownerId,
        categoryId,
        `Premium ${loc.name} Package ${i}`,
        `Nikmati keindahan ${loc.name} dengan layanan eksklusif nomor ${i}.`,
        (Math.floor(Math.random() * 30) + 10) * 50000,
        'IDR',
        loc.name,
        lat.toString(),
        lng.toString(),
        `https://picsum.photos/seed/product${i}/800/600`,
        JSON.stringify(["Insurance", "Meals Included"]),
        JSON.stringify({ duration: "2D1N", transport: "MPV" }),
        Math.floor(Math.random() * 20) + 5,
        (Math.random() * (5 - 4) + 4).toFixed(1),
        1
      ]);
    }

    // 4. Proses Insert (Pastikan tanda kurung di kolom sudah benar)
    const sql = `
      INSERT INTO products (
        owner_id, category_id, name, description, price, 
        currency, location, lat, lng, image_url, 
        features, details, daily_capacity, rating, is_active
      )
      VALUES ?
    `;

    await pool.query(sql, [products]);
    
    console.log(`✅ Success: 30 Produk untuk agent@trivigo.com (ID: ${ownerId}) berhasil dibuat.`); 

  } catch (error) {
    console.error('❌ Error Seeding Products:', error.message);
  } finally {
    if (pool) {
      await pool.end();
      console.log('--- Koneksi Database Ditutup ---');
    }
    process.exit();
  }
}

seedProducts();