const db = require('../../configs/db');
const crypto = require('crypto');

async function seed() {
  console.log('--- [START] Seeding Comprehensive Portfolio Data ---');

  // ── 1. USERS & USER PROFILES ──────────────────────────────────────────────
  console.log('1. Updating and adding realistic users & profiles...');

  // Update existing core users
  await db.query(`
    UPDATE users SET 
      profile_photo = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face'
    WHERE id = 1
  `);
  await db.query(`
    UPDATE users SET 
      profile_photo = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
      phone_number = '081234567890'
    WHERE id = 2
  `);
  await db.query(`
    UPDATE users SET 
      profile_photo = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face',
      specialization = 'tour',
      phone_number = '081398765432'
    WHERE id = 3
  `);

  // Extra customer reviewers
  const extraReviewers = [
    { name: 'Budi Santoso', email: 'budi.santoso@gmail.com', phone: '081298812301', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face' },
    { name: 'Siti Rahmawati', email: 'siti.rahma@gmail.com', phone: '081298812302', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face' },
    { name: 'Michael Tan', email: 'michael.tan@gmail.com', phone: '081298812303', photo: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200&h=200&fit=crop&crop=face' },
    { name: 'Dewi Lestari', email: 'dewi.lestari@gmail.com', phone: '081298812304', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face' },
    { name: 'Kevin Pratama', email: 'kevin.pratama@gmail.com', phone: '081298812305', photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop&crop=face' },
    { name: 'Rina Anggraini', email: 'rina.anggraini@gmail.com', phone: '081298812306', photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face' },
    { name: 'Agus Wijaya', email: 'agus.wijaya@gmail.com', phone: '081298812307', photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face' },
    { name: 'Maya Putri', email: 'maya.putri@gmail.com', phone: '081298812308', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face' }
  ];

  const reviewerUserIds = [2]; // include Customer Trivigo
  for (const rev of extraReviewers) {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [rev.email]);
    if (existing.length > 0) {
      reviewerUserIds.push(existing[0].id);
    } else {
      const [ins] = await db.query(`
        INSERT INTO users (name, email, phone_number, profile_photo, password_hash, role, is_active, verification_status)
        VALUES (?, ?, ?, ?, '$2a$10$wT2iZ0iQY9k5n7I1K7f8jO4G3d2C1bA0z9y8x7w6v5u4t3s2r1q0p', 'CUSTOMER', 1, 'VERIFIED')
      `, [rev.name, rev.email, rev.phone, rev.photo]);
      reviewerUserIds.push(ins.insertId);
    }
  }

  // Populate user_profiles
  for (const uid of [1, 2, 3, ...reviewerUserIds]) {
    const [userRows] = await db.query('SELECT name, profile_photo, phone_number FROM users WHERE id = ?', [uid]);
    if (!userRows.length) continue;
    const u = userRows[0];
    const [profExists] = await db.query('SELECT id FROM user_profiles WHERE user_id = ?', [uid]);
    if (profExists.length === 0) {
      await db.query(`
        INSERT INTO user_profiles (user_id, phone, address, address_line, avatar_url)
        VALUES (?, ?, 'Jakarta, Indonesia', 'Jl. Jenderal Sudirman No. 45', ?)
      `, [uid, u.phone_number || '081234567890', u.profile_photo]);
    }
  }
  console.log(`[OK] Created/updated user profiles for ${reviewerUserIds.length + 2} users`);

  // ── 2. AGENT VERIFICATIONS ────────────────────────────────────────────────
  console.log('2. Seeding agent verification for Agent Trivigo...');
  const [avExists] = await db.query('SELECT id FROM agent_verifications WHERE user_id = 3');
  if (avExists.length === 0) {
    await db.query(`
      INSERT INTO agent_verifications (
        user_id, agent_type, specialization, id_card_number, tax_id, company_name,
        bank_name, bank_account_number, bank_account_holder,
        id_document_url, sk_document_url, status, reviewed_by, reviewed_at
      )
      VALUES (
        3, 'company', 'tour', '3201123456780001', '01.234.567.8-012.000', 'PT Trivgoo Wisata Nusantara',
        'BCA', '8830192831', 'PT Trivgoo Wisata Nusantara',
        'https://picsum.photos/seed/id_doc/800/600', 'https://picsum.photos/seed/sk_doc/800/600',
        'VERIFIED', 1, NOW()
      )
    `);
    console.log('[OK] Agent verification approved for PT Trivgoo Wisata Nusantara');
  }

  // ── 3. REVIEWS ────────────────────────────────────────────────────────────
  console.log('3. Seeding reviews for products...');
  const reviewComments = [
    { rating: 5, comment: 'Pengalaman luar biasa! Pemandangan sangat memukau, pemandu ramah dan informatif. Fasilitas kapal dan konsumsi sangat bersih dan lezat.', reply: 'Terima kasih banyak atas kunjungannya! Senang sekali bisa memberikan pengalaman terbaik untuk Anda. Ditunggu trip selanjutnya bersama Trivgoo!' },
    { rating: 5, comment: 'Pelayanan sangat profesional dari awal penjemputan hingga tour selesai. Tepat waktu dan semua destinasi sesuai dengan itinerary.', reply: 'Terima kasih atas kepercayaannya Kak! Kepuasan dan kenyamanan tamu selalu menjadi prioritas utama kami.' },
    { rating: 5, comment: 'Sangat recommended untuk liburan keluarga! Anak-anak dan orang tua sangat menikmati perjalanan. Driver dan tour guide sangat sabar.', reply: 'Senang sekali mendengar keluarga menikmati liburannya! Salam hangat untuk seluruh keluarga ya Kak.' },
    { rating: 4, comment: 'Pemandangannya juara! Spot foto instagramable banget. Makan siangnya enak, hanya saja ombaknya agak tinggi waktu siang tapi krunya sangat sigap dan aman.', reply: 'Terima kasih atas ulasan dan sarannya Kak! Keamanan tamu adalah prioritas kami. Semoga bisa bertemu lagi di destinasi berikutnya!' },
    { rating: 5, comment: 'Best trip ever! Snorkeling bersama manta ray dan pemandangan sunrise di puncak bukit tidak akan pernah terlupakan. Worth every penny!', reply: 'Wah manta ray-nya memang magis ya Kak! Terima kasih banyak sudah menjelajah nusantara bersama kami.' },
    { rating: 5, comment: 'Kamar villa sangat bersih, pemandangan menghadap laut langsung. Sarapannya bervariasi dan stafnya ramah sekali.', reply: 'Terima kasih Kak! Kami senang Anda merasa nyaman selama menginap.' },
    { rating: 4, comment: 'Armada mobil sangat prima, AC dingin, dan driver hapal jalan alternatif jadi tidak terjebak macet. Mantap!', reply: 'Terima kasih atas feedback positifnya! Senang bisa membantu mobilitas Anda selama liburan.' }
  ];

  // Ambil booking CONFIRMED / COMPLETED untuk setiap produk
  const [products] = await db.query('SELECT id, name FROM products');
  let reviewCount = 0;

  for (const prod of products) {
    const [bookings] = await db.query(`
      SELECT id FROM bookings 
      WHERE product_id = ? AND status IN ('CONFIRMED', 'COMPLETED')
      LIMIT 3
    `, [prod.id]);

    for (let i = 0; i < bookings.length; i++) {
      const b = bookings[i];
      const reviewerId = reviewerUserIds[i % reviewerUserIds.length];
      const revTemplate = reviewComments[(prod.id + i) % reviewComments.length];

      // Update booking user_id agar match dengan reviewer
      await db.query('UPDATE bookings SET user_id = ? WHERE id = ?', [reviewerId, b.id]);

      // Insert review jika belum ada
      const [rExists] = await db.query('SELECT id FROM reviews WHERE booking_id = ?', [b.id]);
      if (rExists.length === 0) {
        await db.query(`
          INSERT INTO reviews (
            user_id, product_id, booking_id, rating, comment, sentiment,
            agent_reply, agent_reply_at, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'positive', ?, DATE_ADD(NOW(), INTERVAL -2 DAY), DATE_ADD(NOW(), INTERVAL -5 DAY), NOW())
        `, [reviewerId, prod.id, b.id, revTemplate.rating, revTemplate.comment, revTemplate.reply]);
        reviewCount++;
      }
    }

    // Update rata-rata rating di tabel products
    const [avgRes] = await db.query('SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ?', [prod.id]);
    if (avgRes[0]?.avg_rating) {
      const roundedRating = Math.round(Number(avgRes[0].avg_rating) * 10) / 10;
      await db.query('UPDATE products SET rating = ? WHERE id = ?', [roundedRating, prod.id]);
    }
  }
  console.log(`[OK] Created ${reviewCount} customer reviews with agent replies across products`);

  // ── 4. SAVED ITINERARIES ──────────────────────────────────────────────────
  console.log('4. Seeding sample saved itineraries for AI Planner showcase...');
  const sampleItineraries = [
    {
      user_id: 2,
      title: '3D2N Ultimate Sailing Komodo & Padar Island Expedition',
      user_story: 'Liburan eksklusif di Labuan Bajo bersama keluarga, mencari spot trekking terbaik, melihat komodo di habitat aslinya, dan snorkeling dengan manta ray.',
      itinerary: `### Rencana Perjalanan 3 Hari 2 Malam: Labuan Bajo Premium

#### **Hari 1: Kedatangan & Sunset di Pulau Kelor**
* **09:00 - 10:30**: Penjemputan di Bandara Komodo (LBJ) & transfer ke Marina Labuan Bajo.
* **11:00 - 13:00**: Boarding kapal Phinisi, briefing keselamatan, dan makan siang mewah di atas dek.
* **14:00 - 16:30**: Berlayar ke **Pulau Kelor**. Trekking ringan ke puncak untuk panorama laut gradasi toska.
* **17:00 - 18:30**: Berlabuh di **Pulau Manjarite**. Sunset spektakuler ditemani kopi Flores dan camilan hangat.
* **19:30 - 21:00**: Makan malam seafood segar di kapal, dilanjutkan stargazing di dek terbuka.

#### **Hari 2: Ikonik Padar, Pantai Pink, & Manta Point**
* **05:00 - 07:30**: Morning hike ke puncak **Pulau Padar** untuk menyaksikan salah satu sunrise terindah di dunia.
* **08:30 - 10:30**: Sarapan di kapal, lalu berlayar ke **Pantai Pink (Pink Beach)**. Waktu bebas untuk foto dan berenang di pasir merah muda alami.
* **11:30 - 14:00**: Eksplorasi **Taman Nasional Komodo (Pulau Komodo)** didampingi Ranger resmi berlisensi.
* **14:30 - 16:30**: Snorkeling eksklusif di **Manta Point** untuk berenang bersama kawanan pari manta raksasa.
* **17:30 - 19:00**: Berlabuh di **Pulau Kalong** untuk menyaksikan ribuan kelelawar raksasa terbang melintasi langit senja.

#### **Hari 3: Gua Rangko & Kembali ke Daratan**
* **07:00 - 08:30**: Sarapan santai sambil berlayar kembali menuju daratan Labuan Bajo.
* **09:30 - 11:30**: Kunjungan ke **Gua Rangko** untuk merasakan sensasi berenang di kolam air asin alami bawah tanah.
* **12:00 - 13:30**: Makan siang perpisahan di restoran tepi tebing Labuan Bajo.
* **14:00**: Pengantaran kembali ke Bandara Komodo untuk penerbangan kepulangan.`,
      recommended_products: [11, 24, 25],
      share_token: 'itin_komodo_vip_2026'
    },
    {
      user_id: 2,
      title: '4D3N Ubud Cultural & Tropical Wellness Retreat Bali',
      user_story: 'Perjalanan solo dan refreshing di Bali, berfokus pada ketenangan, yoga pagi di tengah sawah, eksplorasi air terjun tersembunyi, dan kuliner sehat.',
      itinerary: `### Rencana Perjalanan 4 Hari 3 Malam: Ubud Sanctuary

#### **Hari 1: Tiba di Pulau Dewata & Sambutan Ubud**
* **12:00**: Penjemputan di Bandara Internasional Ngurah Rai (DPS) dengan mobil MPV nyaman ber-AC.
* **14:00**: Check-in di Villa privat dengan pemandangan lembah sawah Ubud.
* **16:00 - 18:00**: Jalan santai di sepanjang **Campuhan Ridge Walk** saat mentari sore meredup.
* **19:00**: Makan malam sehat berbasis bahan organik di restoran lokal ternama Ubud.

#### **Hari 2: Yoga, Hutan Suci, & Seni Tradisional**
* **07:00 - 08:30**: Sesi yoga pagi di studio terbuka dengan semilir angin pedesaan.
* **10:00 - 12:00**: Mengunjungi **Sacred Monkey Forest Sanctuary** dan Puri Saren Agung (Istana Ubud).
* **13:00 - 15:30**: Eksplorasi terasering sawah **Tegalalang** dan mencicipi kopi Luwak di perkebunan agrowisata.
* **16:30 - 18:00**: Spa tradisional Bali selama 90 menit untuk relaksasi tubuh dan pikiran.

#### **Hari 3: Air Terjun Tersembunyi & Sunset Pantai Canggu**
* **08:30 - 11:00**: Petualangan menuju **Air Terjun Tibumana** & Tukad Cepung dengan formasi cahaya dramatis.
* **12:30 - 14:00**: Makan siang santai di kafe estetis bernuansa bambu.
* **16:00 - 18:30**: Menuju pesisir pantai barat untuk menikmati matahari terbenam spektakuler di beach club ramah santai.

#### **Hari 4: Belanja Kerajinan & Kepulangan**
* **09:00 - 11:00**: Berburu cinderamata unik di Pasar Seni Tradisional Ubud.
* **12:00**: Check-out dan pengantaran kembali ke Bandara DPS.`,
      recommended_products: [1, 2, 26],
      share_token: 'itin_ubud_wellness_2026'
    },
    {
      user_id: 2,
      title: '3D2N Eksotisme Lombok: Gili Trawangan & Pantai Pink',
      user_story: 'Trip romantis pasangan muda menjelajahi keindahan laut Nusa Tenggara Barat, snorkeling kura-kura, dan bersantai di pulau bebas polusi.',
      itinerary: `### Rencana Perjalanan 3 Hari 2 Malam: Eksotisme Lombok

#### **Hari 1: Menuju Gili Trawangan**
* **10:00**: Penjemputan di Bandara Internasional Lombok (LOP).
* **12:00**: Menyeberang dengan speedboat pribadi dari Pelabuhan Teluk Nare menuju **Gili Trawangan**.
* **14:00**: Check-in resort tepi pantai dan menyewa sepeda ontel.
* **17:00**: Menikmati sunset tepi pantai dengan iringan live acoustic.

#### **Hari 2: Snorkeling 3 Gili & Patung Bawah Laut**
* **09:00 - 13:00**: Private glass-bottom boat tour mengitari Gili Meno dan Gili Air. Snorkeling di spot patung bawah laut (*Nest*) dan berenang bersama penyu liar.
* **14:00 - 16:00**: Makan siang seafood bakar di Gili Air.
* **19:00**: Romantic dinner dengan pemandangan bintang di bibir pantai.

#### **Hari 3: Desa Adat Sade & Sirkuit Mandalika**
* **08:30**: Menyeberang kembali ke daratan utama Lombok.
* **10:30 - 12:00**: Kunjungan budaya ke **Desa Tradisional Sasak Sade** untuk melihat arsitektur rumah adat dan tenun songket khas.
* **13:00 - 14:30**: Melewati panorama megah Sirkuit Internasional Mandalika dan Bukit Merese.
* **15:30**: Pengantaran kembali ke Bandara LOP.`,
      recommended_products: [7, 8, 23],
      share_token: 'itin_lombok_escape_2026'
    }
  ];

  for (const it of sampleItineraries) {
    const [itExists] = await db.query('SELECT id FROM saved_itineraries WHERE share_token = ?', [it.share_token]);
    if (itExists.length === 0) {
      await db.query(`
        INSERT INTO saved_itineraries (user_id, title, user_story, itinerary, recommended_products, share_token)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [it.user_id, it.title, it.user_story, it.itinerary, JSON.stringify(it.recommended_products), it.share_token]);
    }
  }
  console.log(`[OK] Seeded ${sampleItineraries.length} rich itineraries for AI Planner`);

  // ── 5. KNOWLEDGE BASE ─────────────────────────────────────────────────────
  console.log('5. Seeding travel knowledge base for AI Concierge...');
  const kbEntries = [
    {
      location: 'Labuan Bajo',
      tip_type: 'musim_terbaik',
      title: 'Waktu Terbaik Mengunjungi Labuan Bajo',
      content: 'Bulan April hingga November adalah musim kemarau ideal untuk berlayar (Liveaboard) karena ombak tenang dan langit cerah. Untuk melihat satwa Komodo aktif kawin, bulan Juli - Agustus adalah momen paling tepat.'
    },
    {
      location: 'Labuan Bajo',
      tip_type: 'tips_perlengkapan',
      title: 'Tips Trekking Pulau Padar & Snorkeling Manta',
      content: 'Bawa sepatu trekking dengan grip baik karena tangga Padar cukup curam dan berdebu. Siapkan reef-safe sunscreen, dry bag tahan air, serta baju ganti di tas ransel kecil sebelum naik speed boat.'
    },
    {
      location: 'Bali',
      tip_type: 'kuliner',
      title: 'Rekomendasi Kuliner Otentik Ubud',
      content: 'Coba Bebek Bengil atau Bebek Tepi Sawah untuk hidangan bebek garing khas Bali, Nasi Ayam Kedewatan Ibu Mangku untuk cita rasa pedas rempah lokal, serta deretan gelato di Jalan Monkey Forest.'
    },
    {
      location: 'Bali',
      tip_type: 'etika_budaya',
      title: 'Etika Berkunjung ke Pura Suci di Bali',
      content: 'Pengunjung wajib mengenakan kain kamen (sarung) dan selendang saat memasuki area suci Pura. Hormati upacara keagamaan yang sedang berlangsung dan hindari berjalan tepat di depan pemuka agama yang sedang memimpin doa.'
    },
    {
      location: 'Lombok',
      tip_type: 'transportasi',
      title: 'Panduan Mobilitas dan Transportasi di Gili',
      content: 'Di kawasan 3 Gili (Trawangan, Meno, Air) kendaraan bermotor dilarang beroperasi. Anda dapat menyewa sepeda dengan tarif sekitar Rp 50.000/hari atau menggunakan Cidomo (kereta kuda khas Lombok) untuk membawa koper besar.'
    },
    {
      location: 'Jakarta',
      tip_type: 'wisata_kota',
      title: 'Keliling Kawasan Bersejarah Kota Tua Jakarta',
      content: 'Gunakan transportasi kereta KRL Commuter Line turun tepat di Stasiun Jakarta Kota. Anda dapat menyewa sepeda ontel warna-warni lengkap dengan topi noni Belanda di pelataran Museum Fatahillah.'
    }
  ];

  for (const kb of kbEntries) {
    const [kbExists] = await db.query('SELECT id FROM knowledge_base WHERE title = ?', [kb.title]);
    if (kbExists.length === 0) {
      await db.query(`
        INSERT INTO knowledge_base (agent_id, location, tip_type, title, content, valid_months, is_approved)
        VALUES (3, ?, ?, ?, ?, 'Jan-Dec', 1)
      `, [kb.location, kb.tip_type, kb.title, kb.content]);
    }
  }
  console.log(`[OK] Seeded ${kbEntries.length} knowledge base records for AI`);

  // ── 6. PRODUCT VOUCHERS ───────────────────────────────────────────────────
  console.log('6. Linking vouchers to products...');
  const [vouchers] = await db.query('SELECT id FROM vouchers LIMIT 4');
  if (vouchers.length > 0) {
    for (let pId = 1; pId <= 15; pId++) {
      const vId = vouchers[pId % vouchers.length].id;
      const [pvExists] = await db.query('SELECT 1 FROM product_vouchers WHERE product_id = ? AND voucher_id = ?', [pId, vId]);
      if (pvExists.length === 0) {
        await db.query('INSERT INTO product_vouchers (product_id, voucher_id) VALUES (?, ?)', [pId, vId]);
      }
    }
    console.log('[OK] Linked active vouchers to top 15 products');
  }

  console.log('--- [COMPLETED] All Portfolio Dummy Data Successfully Seeded! ---');
  process.exit(0);
}

seed().catch(err => {
  console.error('[FAILED] Seeding error:', err);
  process.exit(1);
});
