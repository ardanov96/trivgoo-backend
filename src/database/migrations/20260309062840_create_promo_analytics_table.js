/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('promo_analytics', (table) => {
    table.increments('id').primary();

    // Bisa untuk voucher atau campaign
    table.enu('source_type', ['voucher', 'campaign']).notNullable();
    table.integer('source_id').unsigned().notNullable();

    // Aggregasi harian
    table.date('date').notNullable();

    table.integer('impressions').notNullable().defaultTo(0);   // berapa kali ditampilkan
    table.integer('attempts').notNullable().defaultTo(0);      // berapa kali dicoba input
    table.integer('success_count').notNullable().defaultTo(0); // berapa kali berhasil dipakai
    table.integer('fail_count').notNullable().defaultTo(0);    // berapa kali gagal (expired, tidak valid, dsb)
    table.decimal('total_discount_given', 14, 2).notNullable().defaultTo(0); // total nilai diskon yang diberikan
    table.decimal('total_revenue', 14, 2).notNullable().defaultTo(0);        // total revenue dari transaksi yg pakai promo

    table.unique(['source_type', 'source_id', 'date'], {
      indexName: 'uq_promo_analytics_daily',
    });

    table.index(['source_type', 'source_id'], 'idx_promo_analytics_source');
    table.index('date', 'idx_promo_analytics_date');

    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('promo_analytics');
};