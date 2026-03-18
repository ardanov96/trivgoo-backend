const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.development') });

'use strict';
const { execute, pool } = require('../src/configs/db');

async function seedCars() {
  try {
    console.log('--- Memulai Seeding Cars ---');

    // Daftar gambar sesuai list folder public/car-rental
    const rawImages = [
      // ── Existing assets ──────────────────────────────────────────────
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
      'innova.jpg',
      // ── New assets (Mar 2026) ─────────────────────────────────────────
      'BigBus43seat.png',
      'BigBus45seat.png',
      'BusMedium30seat.png',
      'BusMedium35seat.png',
      'Fortuner.png',
      'InnovaReborn.png',
      'InnovaZenix.png',
    ];

    const sql = `
      INSERT INTO cars (
        name, slug, brand, model_year, transmission,
        seats, fuel_type, image, description, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        brand       = VALUES(brand),
        image       = VALUES(image),
        model_year  = VALUES(model_year),
        seats       = VALUES(seats),
        updated_at  = NOW();
    `;

    for (const fileName of rawImages) {
      const nameOnly    = fileName.replace(/\.[^.]+$/, ''); // hapus ekstensi
      const slug        = nameOnly.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const displayName = nameOnly
        .replace(/([a-z])([A-Z])/g, '$1 $2')   // CamelCase → spasi
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .trim();

      // ── Brand ──────────────────────────────────────────────────────────
      let brand = 'Other';
      if (['agya','avanza','alphard','calya','camry','hiace','landcruiser',
           'vellfire','vios','yarris','innova'].includes(slug))             brand = 'Toyota';
      else if (slug === 'innova-reborn' || slug === 'innova-zenix')        brand = 'Toyota';
      else if (slug === 'fortuner')                                        brand = 'Toyota';
      else if (slug.includes('bmw'))                                       brand = 'BMW';
      else if (['brio','jazz','mobilio'].includes(slug))                   brand = 'Honda';
      else if (['binguo','wuling-air','wulingair'].includes(slug))         brand = 'Wuling';
      else if (['creta','ioniq','stargazer','staria','palisade'].includes(slug)) brand = 'Hyundai';
      else if (['pajero','xpander'].includes(slug))                        brand = 'Mitsubishi';
      else if (['ayla','rocky','sigra','terios'].includes(slug))           brand = 'Daihatsu';
      else if (['ertiga','ignis','spresso'].includes(slug))                brand = 'Suzuki';
      else if (slug.includes('mercy'))                                     brand = 'Mercedes-Benz';
      else if (['aventador','huracan'].includes(slug))                     brand = 'Lamborghini';
      else if (slug.includes('porsche'))                                   brand = 'Porsche';
      else if (slug === 'minicooper' || slug === 'mini-cooper')            brand = 'MINI';
      else if (slug === 'kiacarnival' || slug === 'kia-carnival')          brand = 'KIA';
      else if (slug === 'grandlivina' || slug === 'grand-livina')          brand = 'Nissan';
      else if (slug === 'elf')                                             brand = 'Isuzu';
      // Bus — brand generic "Bus"
      else if (slug.includes('big-bus') || slug.includes('bus-medium') ||
               slug.includes('bigbus') || slug.includes('busmedium'))      brand = 'Bus';

      // ── Model Year ─────────────────────────────────────────────────────
      let modelYear = '2024';
      if (['bmwe90','bmwe523i','grandlivina','jazz'].includes(slug))              modelYear = '2012';
      else if (['bmwf30','vios','mercyslk','porscheboxter'].includes(slug))       modelYear = '2016';
      else if (['agya','ayla','ertiga','mobilio','brio'].includes(slug))          modelYear = '2019';
      else if (['pajero','xpander','avanza','calya'].includes(slug))              modelYear = '2022';
      else if (['innova-reborn'].includes(slug))                                  modelYear = '2023';
      else if (['innova-zenix','fortuner'].includes(slug))                        modelYear = '2024';

      // ── Seats ──────────────────────────────────────────────────────────
      let seats = 5;
      if (['alphard','avanza','calya','ertiga','grandlivina','mobilio','pajero',
           'xpander','stargazer','vellfire','terios','sigra','kiacarnival',
           'palisade','innova','innova-reborn','innova-zenix','fortuner'].includes(slug)) seats = 7;
      else if (['hiace','elf'].includes(slug))                                            seats = 15;
      else if (['aventador','huracan','porscheboxter','bmwz4',
                'bmwz4cabriolet','mercyslk'].includes(slug))                              seats = 2;
      // Bus — ambil angka dari slug/nama file
      else if (slug.includes('43') || fileName.includes('43seat'))  seats = 43;
      else if (slug.includes('45') || fileName.includes('45seat'))  seats = 45;
      else if (slug.includes('30') || fileName.includes('30seat'))  seats = 30;
      else if (slug.includes('35') || fileName.includes('35seat'))  seats = 35;

      // ── Fuel Type ──────────────────────────────────────────────────────
      let fuelType = 'Bensin';
      if (slug.includes('air') || slug.includes('ioniq') || slug.includes('binguo')) {
        fuelType = 'Electric';
      } else if (['innova-zenix'].includes(slug)) {
        fuelType = 'Hybrid';
      }

      const values = [
        displayName,
        slug,
        brand,
        modelYear,
        'Automatic',
        seats,
        fuelType,
        `/car-rental/${fileName}`,
        `Sewa ${displayName} ${modelYear} terbaik untuk perjalanan Anda.`,
      ];

      await execute(sql, values);
      console.log(`✅ [${brand}] ${displayName} — ${seats} seats (${modelYear}) berhasil diproses.`);
    }

    console.log(`\n--- Seeding ${rawImages.length} Cars Selesai ---`);

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