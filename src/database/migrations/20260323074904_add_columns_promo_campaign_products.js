/**
 * Migration: add promo_campaign_products columns
 * Menambahkan kolom discount_pct, sale_price, status, joined_at
 * ke tabel promo_campaign_products agar data join campaign dari agent tersimpan lengkap.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('promo_campaign_products', (table) => {
    table.decimal('discount_pct', 5, 2).nullable().after('scope_id');
  });
  await knex.schema.alterTable('promo_campaign_products', (table) => {
    table.decimal('sale_price', 15, 2).nullable().after('discount_pct');
  });
  await knex.schema.alterTable('promo_campaign_products', (table) => {
    table.enu('status', ['active', 'inactive'])
      .notNullable()
      .defaultTo('active')
      .after('sale_price');
  });
  await knex.schema.alterTable('promo_campaign_products', (table) => {
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