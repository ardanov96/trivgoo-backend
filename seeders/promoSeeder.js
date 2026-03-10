'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.development') });

const { pool } = require('../src/configs/db');

async function seedPromo() {
  try {
    console.log('=== Memulai Seeding Promo, Membership, Points & Referral ===\n');
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    // ── Ambil user IDs ─────────────────────────────────────────────────────────
    const [userRows] = await pool.query(
      `SELECT id, email FROM users ORDER BY id ASC LIMIT 10`
    );
    if (!userRows || userRows.length === 0) {
      throw new Error('Tidak ada user ditemukan. Jalankan userSeeder dulu!');
    }
    const userIds = userRows.map((u) => u.id);
    const adminId = userIds[0];
    console.log(`✅ Ditemukan ${userIds.length} user. Admin ID: ${adminId}`);

    // ══════════════════════════════════════════════════════════════════════════
    // 1. MEMBERSHIP TIERS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[1/8] Seeding membership_tiers...');

    // Hapus dulu jika sudah ada (untuk re-run)
    await pool.query('DELETE FROM membership_tiers');
    await pool.query('ALTER TABLE membership_tiers AUTO_INCREMENT = 1');

    const tiers = [
      {
        name: 'Bronze',
        slug: 'bronze',
        description: 'Tier awal untuk semua member baru Trivgoo.',
        icon: '🥉',
        color: '#CD7F32',
        min_spending: 0,
        min_points: 0,
        discount_percent: 0,
        point_multiplier: 1.0,
        max_discount_per_order: null,
        level: 1,
        is_active: 1,
      },
      {
        name: 'Silver',
        slug: 'silver',
        description: 'Nikmati diskon eksklusif dan poin lebih banyak.',
        icon: '🥈',
        color: '#C0C0C0',
        min_spending: 2000000,
        min_points: 500,
        discount_percent: 3.00,
        point_multiplier: 1.5,
        max_discount_per_order: 150000,
        level: 2,
        is_active: 1,
      },
      {
        name: 'Gold',
        slug: 'gold',
        description: 'Akses prioritas dan benefit perjalanan premium.',
        icon: '🥇',
        color: '#FFD700',
        min_spending: 10000000,
        min_points: 2000,
        discount_percent: 7.00,
        point_multiplier: 2.0,
        max_discount_per_order: 500000,
        level: 3,
        is_active: 1,
      },
      {
        name: 'Platinum',
        slug: 'platinum',
        description: 'Layanan VIP eksklusif untuk traveler terbaik.',
        icon: '💎',
        color: '#E5E4E2',
        min_spending: 50000000,
        min_points: 10000,
        discount_percent: 15.00,
        point_multiplier: 3.0,
        max_discount_per_order: 2000000,
        level: 4,
        is_active: 1,
      },
    ];

    for (const tier of tiers) {
      await pool.query('INSERT INTO membership_tiers SET ?', [tier]);
    }
    console.log(`✅ ${tiers.length} membership tiers berhasil dibuat.`);

    // Ambil tier IDs
    const [tierRows] = await pool.query('SELECT id, slug FROM membership_tiers ORDER BY level ASC');
    const tierMap = Object.fromEntries(tierRows.map((t) => [t.slug, t.id]));

    // ══════════════════════════════════════════════════════════════════════════
    // 2. USER MEMBERSHIPS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[2/8] Seeding user_memberships...');
    await pool.query('DELETE FROM user_memberships');

    const tierSlugs = ['bronze', 'silver', 'gold', 'platinum', 'bronze', 'silver', 'gold', 'bronze', 'silver', 'bronze'];
    const spendingByTier = {
      bronze:   [0, 1500000],
      silver:   [2000000, 9000000],
      gold:     [10000000, 45000000],
      platinum: [50000000, 150000000],
    };

    for (let i = 0; i < userIds.length; i++) {
      const slug = tierSlugs[i % tierSlugs.length];
      const [min, max] = spendingByTier[slug];
      const spending = Math.floor(Math.random() * (max - min) + min);
      const points   = Math.floor(spending / 10000);

      await pool.query('INSERT INTO user_memberships SET ?', [{
        user_id:             userIds[i],
        tier_id:             tierMap[slug],
        total_spending:      spending,
        total_points_earned: points,
        tier_achieved_at:    new Date(Date.now() - Math.random() * 90 * 86400000),
        tier_expires_at:     new Date(Date.now() + 365 * 86400000),
      }]);
    }
    console.log(`✅ ${userIds.length} user memberships berhasil dibuat.`);

    // ══════════════════════════════════════════════════════════════════════════
    // 3. POINT BALANCES & TRANSACTIONS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[3/8] Seeding point_balances...');
    await pool.query('DELETE FROM point_balances');

    console.log('[4/8] Seeding point_transactions...');
    await pool.query('DELETE FROM point_transactions');

    const txTypes = [
      'earn_purchase', 'earn_referral', 'earn_review',
      'earn_birthday', 'earn_campaign', 'spend_checkout',
    ];

    for (const uid of userIds) {
      const lifetimeEarned  = Math.floor(Math.random() * 5000) + 500;
      const lifetimeSpent   = Math.floor(lifetimeEarned * 0.3);
      const lifetimeExpired = Math.floor(lifetimeEarned * 0.05);
      const balance         = lifetimeEarned - lifetimeSpent - lifetimeExpired;

      await pool.query('INSERT INTO point_balances SET ?', [{
        user_id:          uid,
        balance:          balance,
        lifetime_earned:  lifetimeEarned,
        lifetime_spent:   lifetimeSpent,
        lifetime_expired: lifetimeExpired,
      }]);

      // 3–6 transaksi per user
      const txCount = Math.floor(Math.random() * 4) + 3;
      let runningBalance = 0;

      for (let t = 0; t < txCount; t++) {
        const type   = txTypes[Math.floor(Math.random() * txTypes.length)];
        const isEarn = type.startsWith('earn');
        const pts    = isEarn
          ? Math.floor(Math.random() * 500) + 50
          : -(Math.floor(Math.random() * 200) + 50);

        runningBalance = Math.max(0, runningBalance + pts);

        await pool.query('INSERT INTO point_transactions SET ?', [{
          user_id:       uid,
          type:          type,
          points:        pts,
          balance_after: runningBalance,
          ref_type:      isEarn ? 'order' : null,
          ref_id:        isEarn ? Math.floor(Math.random() * 100) + 1 : null,
          note:          isEarn ? 'Poin dari pembelian produk' : 'Poin digunakan saat checkout',
          expires_at:    isEarn ? new Date(Date.now() + 365 * 86400000) : null,
          created_at:    new Date(Date.now() - Math.random() * 180 * 86400000),
          updated_at:    new Date(),
        }]);
      }
    }
    console.log(`✅ Point balances & transactions untuk ${userIds.length} user berhasil dibuat.`);

    // ══════════════════════════════════════════════════════════════════════════
    // 4. VOUCHERS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[5/8] Seeding vouchers...');
    await pool.query('DELETE FROM vouchers');
    await pool.query('ALTER TABLE vouchers AUTO_INCREMENT = 1');

    const now = new Date();
    const in30days  = new Date(now.getTime() + 30  * 86400000);
    const in7days   = new Date(now.getTime() + 7   * 86400000);
    const in90days  = new Date(now.getTime() + 90  * 86400000);
    const yesterday = new Date(now.getTime() - 1   * 86400000);

    const vouchers = [
      {
        code: 'WELCOME10',
        description: 'Diskon 10% untuk pengguna baru Trivgoo',
        type: 'percent',
        value: 10.00,
        max_discount: 100000,
        min_transaction: 500000,
        scope: 'all',
        scope_ids: null,
        max_usage: 1000,
        used_count: 47,
        per_user: 1,
        starts_at: now,
        expires_at: in90days,
        is_active: 1,
        created_by: adminId,
      },
      {
        code: 'BALI50K',
        description: 'Potongan Rp 50.000 untuk paket wisata Bali',
        type: 'fixed',
        value: 50000.00,
        max_discount: null,
        min_transaction: 750000,
        scope: 'category',
        scope_ids: JSON.stringify([1]),
        max_usage: 500,
        used_count: 123,
        per_user: 1,
        starts_at: now,
        expires_at: in30days,
        is_active: 1,
        created_by: adminId,
      },
      {
        code: 'HEMAT20',
        description: 'Diskon 20% maksimal Rp 200.000',
        type: 'percent',
        value: 20.00,
        max_discount: 200000,
        min_transaction: 1000000,
        scope: 'all',
        scope_ids: null,
        max_usage: 200,
        used_count: 88,
        per_user: 1,
        starts_at: now,
        expires_at: in7days,
        is_active: 1,
        created_by: adminId,
      },
      {
        code: 'FLASHDEAL',
        description: 'Flash sale 30% untuk hotel & villa',
        type: 'percent',
        value: 30.00,
        max_discount: 300000,
        min_transaction: 1500000,
        scope: 'category',
        scope_ids: JSON.stringify([2]),
        max_usage: 100,
        used_count: 99,
        per_user: 1,
        starts_at: now,
        expires_at: in7days,
        is_active: 1,
        created_by: adminId,
      },
      {
        code: 'MEMBER15',
        description: 'Khusus member Gold & Platinum — diskon 15%',
        type: 'percent',
        value: 15.00,
        max_discount: 500000,
        min_transaction: 2000000,
        scope: 'all',
        scope_ids: null,
        max_usage: null,
        used_count: 34,
        per_user: 1,
        starts_at: now,
        expires_at: in90days,
        is_active: 1,
        created_by: adminId,
      },
      {
        code: 'EXPIRED999',
        description: 'Voucher expired (untuk testing)',
        type: 'fixed',
        value: 99000.00,
        max_discount: null,
        min_transaction: 0,
        scope: 'all',
        scope_ids: null,
        max_usage: 50,
        used_count: 50,
        per_user: 1,
        starts_at: new Date(now.getTime() - 30 * 86400000),
        expires_at: yesterday,
        is_active: 0,
        created_by: adminId,
      },
      {
        code: 'CARRENT10',
        description: 'Diskon 10% untuk sewa kendaraan',
        type: 'percent',
        value: 10.00,
        max_discount: 75000,
        min_transaction: 300000,
        scope: 'category',
        scope_ids: JSON.stringify([3]),
        max_usage: 300,
        used_count: 12,
        per_user: 1,
        starts_at: now,
        expires_at: in30days,
        is_active: 1,
        created_by: adminId,
      },
      {
        code: 'PAYDAY25',
        description: 'Diskon akhir bulan 25% — min transaksi Rp 2 juta',
        type: 'percent',
        value: 25.00,
        max_discount: 250000,
        min_transaction: 2000000,
        scope: 'all',
        scope_ids: null,
        max_usage: 150,
        used_count: 0,
        per_user: 1,
        starts_at: now,
        expires_at: in30days,
        is_active: 1,
        created_by: adminId,
      },
    ];

    for (const v of vouchers) {
      await pool.query('INSERT INTO vouchers SET ?', [v]);
    }
    console.log(`✅ ${vouchers.length} vouchers berhasil dibuat.`);

    // Ambil voucher IDs
    const [voucherRows] = await pool.query('SELECT id, code FROM vouchers');
    const voucherMap = Object.fromEntries(voucherRows.map((v) => [v.code, v.id]));

    // ══════════════════════════════════════════════════════════════════════════
    // 5. VOUCHER USAGES (sample — 1 user per voucher aktif)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[5b] Seeding voucher_usages...');
    await pool.query('DELETE FROM voucher_usages');

    const activeVoucherCodes = ['WELCOME10', 'BALI50K', 'HEMAT20'];
    for (let i = 0; i < activeVoucherCodes.length && i < userIds.length; i++) {
      const vid   = voucherMap[activeVoucherCodes[i]];
      const uid   = userIds[i + 1] ?? userIds[0];
      const orig  = (Math.floor(Math.random() * 10) + 5) * 100000;
      const disc  = Math.floor(orig * 0.1);
      const final = orig - disc;

      await pool.query('INSERT INTO voucher_usages SET ?', [{
        voucher_id:       vid,
        user_id:          uid,
        order_id:         Math.floor(Math.random() * 100) + 1,
        original_amount:  orig,
        discount_amount:  disc,
        final_amount:     final,
        used_at:          new Date(Date.now() - Math.random() * 14 * 86400000),
      }]);
    }
    console.log(`✅ ${activeVoucherCodes.length} voucher usages berhasil dibuat.`);

    // ══════════════════════════════════════════════════════════════════════════
    // 6. PROMO CAMPAIGNS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[6/8] Seeding promo_campaigns...');
    await pool.query('DELETE FROM promo_campaign_products');
    await pool.query('DELETE FROM promo_campaigns');
    await pool.query('ALTER TABLE promo_campaigns AUTO_INCREMENT = 1');

    const campaigns = [
      {
        name: 'Harbolnas Flash Sale',
        slug: 'harbolnas-flash-sale',
        description: 'Diskon besar-besaran dalam rangka Hari Belanja Online Nasional. Dapatkan harga terbaik untuk semua paket wisata!',
        banner_image: 'uploads/banners/harbolnas.jpg',
        type: 'flash_sale',
        discount_type: 'percent',
        discount_value: 25.00,
        max_discount: 500000,
        min_transaction: 1000000,
        scope: 'all',
        min_tier_id: null,
        starts_at: now,
        ends_at: in7days,
        max_usage: 500,
        used_count: 87,
        per_user: 1,
        is_active: 1,
        created_by: adminId,
      },
      {
        name: 'Lebaran Holiday Special',
        slug: 'lebaran-holiday-special',
        description: 'Rayakan Lebaran dengan perjalanan istimewa. Nikmati diskon spesial untuk semua destinasi wisata Indonesia.',
        banner_image: 'uploads/banners/lebaran.jpg',
        type: 'seasonal',
        discount_type: 'percent',
        discount_value: 20.00,
        max_discount: 400000,
        min_transaction: 1500000,
        scope: 'category',
        min_tier_id: null,
        starts_at: now,
        ends_at: in30days,
        max_usage: 1000,
        used_count: 245,
        per_user: 1,
        is_active: 1,
        created_by: adminId,
      },
      {
        name: 'Gold & Platinum Exclusive',
        slug: 'gold-platinum-exclusive',
        description: 'Program eksklusif khusus member Gold dan Platinum. Dapatkan diskon premium dan layanan prioritas.',
        banner_image: 'uploads/banners/member-exclusive.jpg',
        type: 'member_only',
        discount_type: 'percent',
        discount_value: 30.00,
        max_discount: 1000000,
        min_transaction: 3000000,
        scope: 'all',
        min_tier_id: tierMap['gold'],
        starts_at: now,
        ends_at: in90days,
        max_usage: null,
        used_count: 56,
        per_user: 1,
        is_active: 1,
        created_by: adminId,
      },
      {
        name: 'Referral Bonus Campaign',
        slug: 'referral-bonus-campaign',
        description: 'Ajak teman dan dapatkan bonus poin ekstra. Setiap referral yang berhasil memberikan 500 poin untuk kamu dan temanmu.',
        banner_image: 'uploads/banners/referral-bonus.jpg',
        type: 'referral_bonus',
        discount_type: 'fixed',
        discount_value: 50000,
        max_discount: null,
        min_transaction: 500000,
        scope: 'all',
        min_tier_id: null,
        starts_at: now,
        ends_at: in90days,
        max_usage: null,
        used_count: 132,
        per_user: 5,
        is_active: 1,
        created_by: adminId,
      },
      {
        name: 'Bali + Hotel Bundle',
        slug: 'bali-hotel-bundle',
        description: 'Paket hemat wisata Bali sekaligus hotel. Beli paket tur + hotel dan hemat hingga Rp 300.000!',
        banner_image: 'uploads/banners/bundle-bali.jpg',
        type: 'bundle',
        discount_type: 'fixed',
        discount_value: 300000,
        max_discount: null,
        min_transaction: 3000000,
        scope: 'category',
        min_tier_id: null,
        starts_at: now,
        ends_at: in30days,
        max_usage: 200,
        used_count: 44,
        per_user: 1,
        is_active: 1,
        created_by: adminId,
      },
      {
        name: 'Weekend Getaway Sale',
        slug: 'weekend-getaway-sale',
        description: 'Promo khusus akhir pekan. Pesan sekarang dan nikmati perjalanan impianmu!',
        banner_image: 'uploads/banners/weekend-sale.jpg',
        type: 'flash_sale',
        discount_type: 'percent',
        discount_value: 15.00,
        max_discount: 200000,
        min_transaction: 800000,
        scope: 'all',
        min_tier_id: null,
        starts_at: new Date(now.getTime() + 5 * 86400000), // mulai 5 hari lagi
        ends_at:   new Date(now.getTime() + 7 * 86400000),
        max_usage: 300,
        used_count: 0,
        per_user: 1,
        is_active: 1,
        created_by: adminId,
      },
    ];

    const campaignIds = [];
    for (const c of campaigns) {
      const [res] = await pool.query('INSERT INTO promo_campaigns SET ?', [c]);
      campaignIds.push({ id: res.insertId, scope: c.scope, type: c.type });
    }
    console.log(`✅ ${campaigns.length} promo campaigns berhasil dibuat.`);

    // ── Promo Campaign Products ────────────────────────────────────────────
    console.log('\n[6b] Seeding promo_campaign_products...');

    // Campaign "Lebaran" → category 1 (tour) & 2 (hotel)
    const lebaranId = campaignIds[1].id;
    await pool.query('INSERT INTO promo_campaign_products SET ?', [
      { campaign_id: lebaranId, scope_type: 'category', scope_id: 1 },
    ]);
    await pool.query('INSERT INTO promo_campaign_products SET ?', [
      { campaign_id: lebaranId, scope_type: 'category', scope_id: 2 },
    ]);

    // Campaign "Bundle Bali" → category 1 & 2
    const bundleId = campaignIds[4].id;
    await pool.query('INSERT INTO promo_campaign_products SET ?', [
      { campaign_id: bundleId, scope_type: 'category', scope_id: 1 },
    ]);
    await pool.query('INSERT INTO promo_campaign_products SET ?', [
      { campaign_id: bundleId, scope_type: 'category', scope_id: 2 },
    ]);

    console.log('✅ Promo campaign products berhasil dibuat.');

    // ══════════════════════════════════════════════════════════════════════════
    // 7. VOUCHER RESTRICTIONS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[7/8] Seeding voucher_restrictions...');
    await pool.query('DELETE FROM voucher_restrictions');

    // MEMBER15 → hanya untuk min tier Gold
    await pool.query('INSERT INTO voucher_restrictions SET ?', [{
      voucher_id: voucherMap['MEMBER15'],
      type:       'min_membership_tier',
      ref_id:     tierMap['gold'],
      note:       'Minimal tier Gold untuk menggunakan voucher ini',
    }]);

    // FLASHDEAL → blacklist 1 kategori (misalnya kategori 3 / car rental)
    await pool.query('INSERT INTO voucher_restrictions SET ?', [{
      voucher_id: voucherMap['FLASHDEAL'],
      type:       'blacklist_category',
      ref_id:     3,
      note:       'Tidak berlaku untuk car rental',
    }]);

    console.log('✅ Voucher restrictions berhasil dibuat.');

    // ══════════════════════════════════════════════════════════════════════════
    // 8. REFERRAL CODES & USAGES
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[8/8] Seeding referral_codes & referral_usages...');
    await pool.query('DELETE FROM referral_usages');
    await pool.query('DELETE FROM referral_codes');
    await pool.query('ALTER TABLE referral_codes AUTO_INCREMENT = 1');

    const referralIds = [];
    for (const uid of userIds) {
      const code = 'TRV' + uid.toString().padStart(4, '0') +
        Math.random().toString(36).substring(2, 5).toUpperCase();

      const [res] = await pool.query('INSERT INTO referral_codes SET ?', [{
        user_id:           uid,
        code:              code,
        referrer_points:   500,
        referrer_discount: 25000,
        referee_points:    250,
        referee_discount:  15000,
        min_transaction:   300000,
        total_uses:        Math.floor(Math.random() * 5),
        max_uses:          20,
        is_active:         1,
      }]);
      referralIds.push({ id: res.insertId, user_id: uid, code });
    }
    console.log(`✅ ${referralIds.length} referral codes berhasil dibuat.`);

    // Buat beberapa referral usages (user[1] direferral oleh user[0], dst.)
    const usagePairs = [
      { referrer: 0, referee: 1 },
      { referrer: 0, referee: 2 },
      { referrer: 1, referee: 3 },
      { referrer: 2, referee: 4 },
    ];

    for (const pair of usagePairs) {
      if (pair.referrer >= userIds.length || pair.referee >= userIds.length) continue;

      const referralCode = referralIds[pair.referrer];
      await pool.query('INSERT INTO referral_usages SET ?', [{
        referral_code_id:         referralCode.id,
        referrer_id:              userIds[pair.referrer],
        referee_id:               userIds[pair.referee],
        referrer_rewarded:        1,
        referee_rewarded:         1,
        qualifying_order_id:      Math.floor(Math.random() * 50) + 1,
        qualifying_order_amount:  Math.floor(Math.random() * 10 + 5) * 100000,
        status:                   'rewarded',
        created_at:               new Date(Date.now() - Math.random() * 60 * 86400000),
        updated_at:               new Date(),
      }]);
    }
    console.log(`✅ ${usagePairs.length} referral usages berhasil dibuat.`);

    // ══════════════════════════════════════════════════════════════════════════
    // 9. PROMO ANALYTICS (sample 7 hari terakhir)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n[9] Seeding promo_analytics...');
    await pool.query('DELETE FROM promo_analytics');

    const analyticsSources = [
      { source_type: 'voucher',   source_id: voucherMap['WELCOME10'] },
      { source_type: 'voucher',   source_id: voucherMap['HEMAT20'] },
      { source_type: 'campaign',  source_id: campaignIds[0].id },
      { source_type: 'campaign',  source_id: campaignIds[1].id },
    ];

    for (const src of analyticsSources) {
      for (let d = 6; d >= 0; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);
        const dateStr = date.toISOString().slice(0, 10);

        const impressions    = Math.floor(Math.random() * 200) + 50;
        const attempts       = Math.floor(impressions * 0.3);
        const success_count  = Math.floor(attempts * 0.6);
        const fail_count     = attempts - success_count;
        const total_discount = success_count * (Math.floor(Math.random() * 50) + 20) * 1000;
        const total_revenue  = success_count * (Math.floor(Math.random() * 200) + 100) * 1000;

        await pool.query('INSERT INTO promo_analytics SET ?', [{
          source_type:          src.source_type,
          source_id:            src.source_id,
          date:                 dateStr,
          impressions,
          attempts,
          success_count,
          fail_count,
          total_discount_given: total_discount,
          total_revenue,
        }]);
      }
    }
    console.log(`✅ Promo analytics untuk ${analyticsSources.length} sumber × 7 hari berhasil dibuat.`);

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ SEEDING SELESAI! Ringkasan:');
    console.log(`   • Membership tiers   : ${tiers.length}`);
    console.log(`   • User memberships   : ${userIds.length}`);
    console.log(`   • Point balances     : ${userIds.length}`);
    console.log(`   • Vouchers           : ${vouchers.length}`);
    console.log(`   • Promo campaigns    : ${campaigns.length}`);
    console.log(`   • Referral codes     : ${referralIds.length}`);
    console.log(`   • Referral usages    : ${usagePairs.length}`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Error saat seeding:', error.message);
    console.error(error.stack);
  } finally {

    if (pool) {
      await pool.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
      await pool.end();
      console.log('\n--- Koneksi Database Ditutup ---');
    }
    process.exit();
  }
}

seedPromo();