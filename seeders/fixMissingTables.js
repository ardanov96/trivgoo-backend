'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.development') });
const { pool } = require('../src/configs/db');

const TABLE_DEFINITIONS = {

  user_memberships: `CREATE TABLE IF NOT EXISTS \`user_memberships\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`user_id\` bigint unsigned NOT NULL,
    \`tier_id\` int unsigned NOT NULL,
    \`total_spending\` decimal(14,2) NOT NULL DEFAULT '0.00',
    \`total_points_earned\` int NOT NULL DEFAULT '0',
    \`tier_achieved_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`tier_expires_at\` datetime DEFAULT NULL,
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`user_memberships_user_id_unique\` (\`user_id\`),
    KEY \`idx_user_memberships_user_id\` (\`user_id\`),
    KEY \`idx_user_memberships_tier_id\` (\`tier_id\`),
    CONSTRAINT \`user_memberships_tier_id_foreign\` FOREIGN KEY (\`tier_id\`) REFERENCES \`membership_tiers\` (\`id\`) ON DELETE RESTRICT,
    CONSTRAINT \`user_memberships_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  voucher_usages: `CREATE TABLE IF NOT EXISTS \`voucher_usages\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`voucher_id\` int unsigned NOT NULL,
    \`user_id\` bigint unsigned NOT NULL,
    \`order_id\` int unsigned DEFAULT NULL,
    \`original_amount\` decimal(10,2) NOT NULL,
    \`discount_amount\` decimal(10,2) NOT NULL,
    \`final_amount\` decimal(10,2) NOT NULL,
    \`used_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_voucher_usages_user_voucher\` (\`voucher_id\`,\`user_id\`),
    KEY \`idx_voucher_usages_voucher_id\` (\`voucher_id\`),
    KEY \`idx_voucher_usages_user_id\` (\`user_id\`),
    CONSTRAINT \`voucher_usages_voucher_id_foreign\` FOREIGN KEY (\`voucher_id\`) REFERENCES \`vouchers\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  voucher_restrictions: `CREATE TABLE IF NOT EXISTS \`voucher_restrictions\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`voucher_id\` int unsigned NOT NULL,
    \`type\` enum('blacklist_user','whitelist_user','blacklist_product','blacklist_category','min_membership_tier') NOT NULL,
    \`ref_id\` int unsigned DEFAULT NULL,
    \`note\` text,
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`idx_voucher_restrictions_voucher_id\` (\`voucher_id\`),
    KEY \`idx_voucher_restrictions_type\` (\`voucher_id\`,\`type\`),
    CONSTRAINT \`voucher_restrictions_voucher_id_foreign\` FOREIGN KEY (\`voucher_id\`) REFERENCES \`vouchers\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  point_balances: `CREATE TABLE IF NOT EXISTS \`point_balances\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`user_id\` bigint unsigned NOT NULL,
    \`balance\` int NOT NULL DEFAULT '0',
    \`lifetime_earned\` int NOT NULL DEFAULT '0',
    \`lifetime_spent\` int NOT NULL DEFAULT '0',
    \`lifetime_expired\` int NOT NULL DEFAULT '0',
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`point_balances_user_id_unique\` (\`user_id\`),
    KEY \`idx_point_balances_user_id\` (\`user_id\`),
    CONSTRAINT \`point_balances_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  point_transactions: `CREATE TABLE IF NOT EXISTS \`point_transactions\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`user_id\` bigint unsigned NOT NULL,
    \`type\` enum('earn_purchase','earn_referral','earn_review','earn_birthday','earn_campaign','spend_redemption','spend_checkout','expired','adjustment') NOT NULL,
    \`points\` int NOT NULL,
    \`balance_after\` int NOT NULL,
    \`ref_type\` varchar(50) DEFAULT NULL,
    \`ref_id\` int DEFAULT NULL,
    \`note\` text,
    \`expires_at\` datetime DEFAULT NULL,
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`idx_point_transactions_user_id\` (\`user_id\`),
    KEY \`idx_point_transactions_user_type\` (\`user_id\`,\`type\`),
    KEY \`idx_point_transactions_expires_at\` (\`expires_at\`),
    KEY \`idx_point_transactions_ref\` (\`ref_type\`,\`ref_id\`),
    CONSTRAINT \`point_transactions_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  point_redemptions: `CREATE TABLE IF NOT EXISTS \`point_redemptions\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`user_id\` bigint unsigned NOT NULL,
    \`points_spent\` int NOT NULL,
    \`redemption_type\` enum('voucher','checkout') NOT NULL,
    \`voucher_id\` int unsigned DEFAULT NULL,
    \`voucher_value\` decimal(10,2) DEFAULT NULL,
    \`order_id\` int unsigned DEFAULT NULL,
    \`discount_amount\` decimal(10,2) DEFAULT NULL,
    \`status\` enum('pending','used','cancelled','expired') NOT NULL DEFAULT 'pending',
    \`expires_at\` datetime DEFAULT NULL,
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    KEY \`idx_point_redemptions_user_id\` (\`user_id\`),
    KEY \`idx_point_redemptions_status\` (\`status\`),
    KEY \`idx_point_redemptions_voucher_id\` (\`voucher_id\`),
    CONSTRAINT \`point_redemptions_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`point_redemptions_voucher_id_foreign\` FOREIGN KEY (\`voucher_id\`) REFERENCES \`vouchers\` (\`id\`) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  promo_campaign_products: `CREATE TABLE IF NOT EXISTS \`promo_campaign_products\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`campaign_id\` int unsigned NOT NULL,
    \`scope_type\` enum('category','product') NOT NULL,
    \`scope_id\` int unsigned NOT NULL,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_campaign_scope\` (\`campaign_id\`,\`scope_type\`,\`scope_id\`),
    KEY \`idx_campaign_products_campaign_id\` (\`campaign_id\`),
    CONSTRAINT \`promo_campaign_products_campaign_id_foreign\` FOREIGN KEY (\`campaign_id\`) REFERENCES \`promo_campaigns\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  referral_codes: `CREATE TABLE IF NOT EXISTS \`referral_codes\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`user_id\` bigint unsigned NOT NULL,
    \`code\` varchar(20) NOT NULL,
    \`referrer_points\` int NOT NULL DEFAULT '0',
    \`referrer_discount\` decimal(10,2) DEFAULT NULL,
    \`referee_points\` int NOT NULL DEFAULT '0',
    \`referee_discount\` decimal(10,2) DEFAULT NULL,
    \`min_transaction\` decimal(10,2) NOT NULL DEFAULT '0.00',
    \`total_uses\` int NOT NULL DEFAULT '0',
    \`max_uses\` int DEFAULT NULL,
    \`is_active\` tinyint NOT NULL DEFAULT '1',
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`referral_codes_user_id_unique\` (\`user_id\`),
    UNIQUE KEY \`referral_codes_code_unique\` (\`code\`),
    KEY \`idx_referral_codes_code\` (\`code\`),
    KEY \`idx_referral_codes_user_id\` (\`user_id\`),
    CONSTRAINT \`referral_codes_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  referral_usages: `CREATE TABLE IF NOT EXISTS \`referral_usages\` (
    \`id\` int unsigned NOT NULL AUTO_INCREMENT,
    \`referral_code_id\` int unsigned NOT NULL,
    \`referrer_id\` bigint unsigned NOT NULL,
    \`referee_id\` bigint unsigned NOT NULL,
    \`referrer_rewarded\` tinyint NOT NULL DEFAULT '0',
    \`referee_rewarded\` tinyint NOT NULL DEFAULT '0',
    \`qualifying_order_id\` int unsigned DEFAULT NULL,
    \`qualifying_order_amount\` decimal(14,2) DEFAULT NULL,
    \`status\` enum('pending','qualified','rewarded','cancelled') NOT NULL DEFAULT 'pending',
    \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_referral_usages_referee\` (\`referee_id\`),
    KEY \`idx_referral_usages_code_id\` (\`referral_code_id\`),
    KEY \`idx_referral_usages_referrer_id\` (\`referrer_id\`),
    KEY \`idx_referral_usages_referee_id\` (\`referee_id\`),
    KEY \`idx_referral_usages_status\` (\`status\`),
    CONSTRAINT \`referral_usages_referral_code_id_foreign\` FOREIGN KEY (\`referral_code_id\`) REFERENCES \`referral_codes\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`referral_usages_referee_id_foreign\` FOREIGN KEY (\`referee_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`referral_usages_referrer_id_foreign\` FOREIGN KEY (\`referrer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
};

const MIGRATION_MAP = {
  user_memberships:         '20260309063638_create_user_memberships_table.js',
  voucher_usages:           '20260309035958_create_voucher_usages_table.js',
  voucher_restrictions:     '20260309062827_create_voucher_restrictions_table.js',
  point_balances:           '20260309063646_create_point_balances_table.js',
  point_transactions:       '20260309063653_create_point_transactions_table.js',
  point_redemptions:        '20260309063701_create_point_redemptions_table.js',
  promo_campaign_products:  '20260309062819_create_promo_campaign_products_table.js',
  referral_codes:           '20260309063708_create_referral_codes_table.js',
  referral_usages:          '20260309063716_create_referral_usages_table.js',
};

async function fixMissingTables() {
  try {
    console.log('=== Fix Missing Tables ===\n');
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');

    const missing = [];
    for (const tbl of Object.keys(TABLE_DEFINITIONS)) {
      try {
        await pool.query(`SELECT 1 FROM \`${tbl}\` LIMIT 1`);
        console.log(`✅ ${tbl.padEnd(35)} — ada`);
      } catch {
        console.log(`❌ ${tbl.padEnd(35)} — TIDAK ADA`);
        missing.push(tbl);
      }
    }

    if (missing.length === 0) {
      console.log('\nSemua tabel sudah ada!');
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
      return;
    }

    console.log(`\nMembuat ${missing.length} tabel...\n`);

    for (const tbl of missing) {
      await pool.query(TABLE_DEFINITIONS[tbl]);
      console.log(`✅ CREATE TABLE ${tbl}`);
      const migName = MIGRATION_MAP[tbl];
      if (migName) {
        await pool.query('DELETE FROM knex_migrations WHERE name = ?', [migName]);
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(
          'INSERT IGNORE INTO knex_migrations (name, batch, migration_time) VALUES (?, 7, ?)',
          [migName, now]
        );
      }
    }

    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✅ Fix selesai! Jalankan: node seeders/promoSeeder.js');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    await pool.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
  } finally {
    await pool.end();
    process.exit();
  }
}

fixMissingTables();