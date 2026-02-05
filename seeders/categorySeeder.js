'use strict';

// Sesuaikan path ke config db kamu, sama seperti di userSeeder.js
const { execute, pool } = require('../src/configs/db');

async function seedCategories() {
  try {
    console.log('--- Memulai Seeding Categories ---');

    const categories = [
      { id: 1, name: 'Tour', slug: 'tour', description: 'Tour and activity services' },
      { id: 2, name: 'Stay', slug: 'stay', description: 'Hotels and Accommodations' },
      { id: 3, name: 'Transport', slug: 'transport', description: 'Car rentals and transfers' }
    ];

    const sql = `
      INSERT INTO categories (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
      name = VALUES(name),
      slug = VALUES(slug),
      description = VALUES(description),
      updated_at = NOW();
    `;

    for (const cat of categories) {
      await execute(sql, [
        cat.id,
        cat.name,
        cat.slug,
        cat.description
      ]);
      console.log(`✅ Success: Category [${cat.name}] berhasil diproses.`);
    }

    console.log('--- Seeding Categories Selesai ---');

  } catch (error) {
    console.error('❌ Error Seeding Categories:', error.message);
  } finally {
    if (pool) {
      await pool.end();
      console.log('--- Koneksi Database Ditutup ---');
    }
    process.exit();
  }
}

seedCategories();