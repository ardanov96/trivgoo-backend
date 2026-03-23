/**
 * Migration: add promo_campaign_products columns
 * Menambahkan kolom discount_pct, sale_price, status, joined_at
 * ke tabel promo_campaign_products agar data join campaign dari agent tersimpan lengkap.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.alterTable('promo_campaign_products', (table) => {
    // Persentase diskon yang diajukan agent saat join campaign
    table.decimal('discount_pct', 5, 2).nullable().after('scope_id');

    // Harga jual setelah diskon (dihitung saat join, disimpan agar tidak perlu recalculate)
    table.decimal('sale_price', 15, 2).nullable().after('discount_pct');

    // Status keikutsertaan produk di campaign: active | inactive
    table.enu('status', ['active', 'inactive'])
      .notNullable()
      .defaultTo('active')
      .after('sale_price');

    // Timestamp kapan produk didaftarkan ke campaign
    table.timestamp('joined_at')
      .notNullable()
      .defaultTo(knex.fn.now())
      .after('status');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.alterTable('promo_campaign_products', (table) => {
    table.dropColumn('discount_pct');
    table.dropColumn('sale_price');
    table.dropColumn('status');
    table.dropColumn('joined_at');
  });
};