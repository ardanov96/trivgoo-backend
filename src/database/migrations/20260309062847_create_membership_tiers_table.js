/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('membership_tiers', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();           // Bronze, Silver, Gold, Platinum
    table.string('slug').unique().notNullable();  // bronze, silver, gold, platinum
    table.text('description').nullable();
    table.string('icon').nullable();              // path icon / emoji
    table.string('color', 20).nullable();         // hex color untuk UI badge

    // Syarat naik tier: minimum total spending (Rp) atau minimum point
    table.decimal('min_spending', 14, 2).notNullable().defaultTo(0);
    table.integer('min_points').notNullable().defaultTo(0);

    // Benefit tier
    table.decimal('discount_percent', 5, 2).notNullable().defaultTo(0); // diskon otomatis saat checkout
    table.decimal('point_multiplier', 5, 2).notNullable().defaultTo(1); // 1.0 = normal, 2.0 = 2x point
    table.decimal('max_discount_per_order', 10, 2).nullable();          // cap diskon tier per transaksi

    // Urutan tier (semakin tinggi = semakin senior)
    table.integer('level').notNullable().defaultTo(0);

    table.tinyint('is_active').notNullable().defaultTo(1);
    table.timestamps(true, true);

    table.index('level', 'idx_membership_tiers_level');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('membership_tiers');
};