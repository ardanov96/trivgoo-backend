/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('promo_campaign_products', (table) => {
    table.increments('id').primary();
    table.integer('campaign_id').unsigned().notNullable();
    table.enu('scope_type', ['category', 'product']).notNullable();
    table.integer('scope_id').unsigned().notNullable();

    table.unique(['campaign_id', 'scope_type', 'scope_id'], {
      indexName: 'uq_campaign_scope',
    });

    table.foreign('campaign_id')
      .references('id')
      .inTable('promo_campaigns')
      .onDelete('CASCADE');

    table.index('campaign_id', 'idx_campaign_products_campaign_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('promo_campaign_products');
};