'use strict';

const { execute, pool } = require('../src/configs/db');

async function seedCars() {
  try {
    console.log('--- Memulai Seeding 45 Cars ---');

    const rawImages = [
      'agya.jpg', 'alphard.jpg', 'avanza.jpg', 'aventador.jpg', 'ayla.jpg',
      'binguo.jpg', 'bmw430i.jpg', 'bmw730li.jpg', 'bmwe90.jpg', 'bmwe523i.jpg',
      'bmwf30.jpg', 'bmwz4cabriolet.jpg', 'bmwz4.jpg', 'brio.jpg', 'calya.jpg',
      'camry.jpg', 'creta.jpg', 'elf.jpg', 'ertiga.jpg', 'grandlivina.jpg',
      'Hiace.jpg', 'huracan.jpg', 'ignis.jpg', 'ioniq.jpg', 'jazz.jpg',
      'kiacarnival.jpg', 'landcruiser.jpg', 'mercys400.jpg', 'minicooper.jpg', 'mobilio.jpg',
      'pajero.jpg', 'palisade.jpg', 'porscheboxter.jpg', 'rocky.jpg', 'sigra.jpg',
      'spresso.jpg', 'stargazer.jpg', 'staria.jpg', 'terios.jpg', 'vellfire.jpg',
      'vios.jpg', 'wulingair.jpg', 'xpander.jpg', 'yarris.jpg'
    ];

    const sql = `
      INSERT INTO cars (
        name, slug, brand, model_year, transmission, 
        seats, fuel_type, image, description, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
        brand = VALUES(brand),
        image = VALUES(image),
        updated_at = NOW();
    `;

    for (const fileName of rawImages) {
      // 1. Bersihkan nama untuk Title (Contoh: bmw430i.jpg -> Bmw430i)
      const nameOnly = fileName.split('.')[0];
      const displayName = nameOnly.charAt(0).toUpperCase() + nameOnly.slice(1);
      const slug = nameOnly.toLowerCase().replace(/_/g, '-');

      // 2. Logika Penentuan Brand & Spesifikasi Sederhana
      let brand = 'Other';
      let seats = 5;
      let trans = 'Automatic';

      if (slug.includes('toyota') || ['agya','avanza','alphard','calya','camry','hiace','landcruiser','vellfire','vios','yarris'].includes(slug)) brand = 'Toyota';
      else if (slug.includes('bmw')) brand = 'BMW';
      else if (slug.includes('honda') || ['brio','jazz','mobilio'].includes(slug)) brand = 'Honda';
      else if (slug.includes('wuling') || ['binguo','wulingair'].includes(slug)) brand = 'Wuling';
      else if (slug.includes('hyundai') || ['creta','ioniq','stargazer','staria','palisade'].includes(slug)) brand = 'Hyundai';
      else if (slug.includes('mitsubishi') || ['pajero','xpander'].includes(slug)) brand = 'Mitsubishi';
      else if (slug.includes('daihatsu') || ['ayla','rocky','sigra','terios'].includes(slug)) brand = 'Daihatsu';
      else if (slug.includes('suzuki') || ['ertiga','ignis','spresso'].includes(slug)) brand = 'Suzuki';
      else if (slug.includes('mercy')) brand = 'Mercedes-Benz';
      else if (slug.includes('lamborghini') || ['aventador','huracan'].includes(slug)) brand = 'Lamborghini';
      else if (slug.includes('porsche')) brand = 'Porsche';

      // 3. Logika Seats
      if (['alphard','avanza','calya','ertiga','grandlivina','mobilio','pajero','xpander','stargazer','vellfire','terios','sigra','kiacarnival','palisade'].includes(slug)) seats = 7;
      else if (['hiace','elf'].includes(slug)) seats = 15;
      else if (['aventador','huracan','porscheboxter','bmwz4','bmwz4cabriolet'].includes(slug)) seats = 2;

      const values = [
        displayName,
        slug,
        brand,
        '2023',
        trans,
        seats,
        (slug.includes('air') || slug.includes('ioniq') || slug.includes('binguo')) ? 'Electric' : 'Bensin',
        `/car-rental/${fileName}`,
        `Sewa ${displayName} terbaik untuk perjalanan Anda.`
      ];

      await execute(sql, values);
      console.log(`✅ Success: [${brand}] ${displayName} berhasil diproses.`);
    }

    console.log('--- Seeding 45 Cars Selesai ---');

  } catch (error) {
    console.error('❌ Error Seeding Cars:', error.message);
  } finally {
    if (pool) {
      await pool.end();
      console.log('--- Koneksi Database Ditutup ---');
    }
    process.exit();
  }
}

seedCars();