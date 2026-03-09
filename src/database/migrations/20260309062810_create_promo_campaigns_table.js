/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('promo_campaigns', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('slug').unique().notNullable();
    table.text('description').nullable();
    table.string('banner_image').nullable();

    // Tipe campaign
    table.enu('type', [
      'flash_sale',       // diskon terbatas waktu
      'seasonal',         // hari raya, liburan, dsb
      'member_only',      // khusus tier tertentu
      'referral_bonus',   // bonus dari referral
      'bundle',           // beli paket hemat
    ]).notNullable().defaultTo('seasonal');

    // Diskon campaign (terpisah dari voucher)
    table.enu('discount_type', ['percent', 'fixed']).notNullable().defaultTo('percent');
    table.decimal('discount_value', 10, 2).notNullable().defaultTo(0);
    table.decimal('max_discount', 10, 2).nullable();
    table.decimal('min_transaction', 10, 2).notNullable().defaultTo(0);

    // Scope berlaku
    table.enu('scope', ['all', 'category', 'product']).notNullable().defaultTo('all');

    // Membership tier minimum yang bisa akses (null = semua user)
    table.integer('min_tier_id').unsigned().nullable();

    // Periode
    table.datetime('starts_at').notNullable();
    table.datetime('ends_at').notNullable();

    table.integer('max_usage').nullable();       // total max penggunaan
    table.integer('used_count').notNullable().defaultTo(0);
    table.tinyint('per_user').notNullable().defaultTo(1); // 1x per user
    table.tinyint('is_active').notNullable().defaultTo(1);
    table.integer('created_by').nullable();
    table.timestamps(true, true);

    table.index('slug', 'idx_promo_campaigns_slug');
    table.index('is_active', 'idx_promo_campaigns_is_active');
    table.index(['starts_at', 'ends_at'], 'idx_promo_campaigns_period');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('promo_campaigns');
};