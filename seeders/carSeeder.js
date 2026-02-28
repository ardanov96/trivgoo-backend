'use strict';

const { execute, pool } = require('../src/configs/db');

async function seedCars() {
  try {
    console.log('--- Memulai Seeding 46 Cars ---');

    // Daftar 46 gambar sesuai list folder public/car-rental
    const rawImages = [
      'agya.jpg', 'alphard.jpg', 'avanza.jpg', 'aventador.jpg', 'ayla.jpg',
      'binguo.jpg', 'bmw430i.jpg', 'bmw730li.jpg', 'bmwe90.jpg', 'bmwe523i.jpg',
      'bmwf30.jpg', 'bmwz4cabriolet.jpg', 'bmwz4.jpg', 'brio.jpg', 'calya.jpg',
      'camry.jpg', 'creta.jpg', 'elf.jpg', 'ertiga.jpg', 'grandlivina.jpg',
      'hiace.jpg', 'huracan.jpg', 'ignis.jpg', 'ioniq.jpg', 'jazz.jpg',
      'kiacarnival.jpg', 'landcruiser.jpg', 'mercys400.jpg', 'mercyslk.jpg', 
      'minicooper.jpg', 'mobilio.jpg', 'pajero.jpg', 'palisade.jpg', 
      'porscheboxter.jpg', 'rocky.jpg', 'sigra.jpg', 'spresso.jpg', 
      'stargazer.jpg', 'staria.jpg', 'terios.jpg', 'vellfire.jpg',
      'vios.jpg', 'wulingair.jpg', 'xpander.jpg', 'yarris.jpg',
      'innova.jpg' // TAMBAHKAN SATU LAGI (Misal: innova.jpg) agar genap 46
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
        model_year = VALUES(model_year),
        updated_at = NOW();
    `;

    for (const fileName of rawImages) {
      const nameOnly = fileName.split('.')[0];
      const displayName = nameOnly.charAt(0).toUpperCase() + nameOnly.slice(1);
      const slug = nameOnly.toLowerCase().replace(/_/g, '-');

      // 1. Logika Brand
      let brand = 'Other';
      if (['agya','avanza','alphard','calya','camry','hiace','landcruiser','vellfire','vios','yarris'].includes(slug)) brand = 'Toyota';
      else if (slug.includes('bmw')) brand = 'BMW';
      else if (['brio','jazz','mobilio'].includes(slug)) brand = 'Honda';
      else if (['binguo','wulingair'].includes(slug)) brand = 'Wuling';
      else if (['creta','ioniq','stargazer','staria','palisade'].includes(slug)) brand = 'Hyundai';
      else if (['pajero','xpander'].includes(slug)) brand = 'Mitsubishi';
      else if (['ayla','rocky','sigra','terios'].includes(slug)) brand = 'Daihatsu';
      else if (['ertiga','ignis','spresso'].includes(slug)) brand = 'Suzuki';
      else if (slug.includes('mercy')) brand = 'Mercedes-Benz';
      else if (['aventador','huracan'].includes(slug)) brand = 'Lamborghini';
      else if (slug.includes('porsche')) brand = 'Porsche';
      else if (slug === 'minicooper') brand = 'MINI';
      else if (slug === 'kiacarnival') brand = 'KIA';
      else if (slug === 'grandlivina') brand = 'Nissan';
      else if (slug === 'elf') brand = 'Isuzu';

      // 2. Logika Model Year (Dinamis untuk mobil second/tua)
      let modelYear = '2024'; // default terbaru
      if (['bmwe90', 'bmwe523i', 'grandlivina', 'jazz'].includes(slug)) modelYear = '2012';
      else if (['bmwf30', 'vios', 'mercyslk', 'porscheboxter'].includes(slug)) modelYear = '2016';
      else if (['agya', 'ayla', 'ertiga', 'mobilio', 'brio'].includes(slug)) modelYear = '2019';
      else if (['pajero', 'xpander', 'avanza', 'calya'].includes(slug)) modelYear = '2022';

      // 3. Logika Seats
      let seats = 5;
      if (['alphard','avanza','calya','ertiga','grandlivina','mobilio','pajero','xpander','stargazer','vellfire','terios','sigra','kiacarnival','palisade'].includes(slug)) seats = 7;
      else if (['hiace','elf'].includes(slug)) seats = 15;
      else if (['aventador','huracan','porscheboxter','bmwz4','bmwz4cabriolet','mercyslk'].includes(slug)) seats = 2;

      const values = [
        displayName,
        slug,
        brand,
        modelYear,
        'Automatic', // Mayoritas rental menggunakan matic
        seats,
        (slug.includes('air') || slug.includes('ioniq') || slug.includes('binguo')) ? 'Electric' : 'Bensin',
        `/car-rental/${fileName}`,
        `Sewa ${displayName} ${modelYear} terbaik untuk perjalanan Anda.`
      ];

      await execute(sql, values);
      console.log(`✅ [${brand}] ${displayName} (${modelYear}) berhasil diproses.`);
    }

    console.log(`--- Seeding ${rawImages.length} Cars Selesai ---`);

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