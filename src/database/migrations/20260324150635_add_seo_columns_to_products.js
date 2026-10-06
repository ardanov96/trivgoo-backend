/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasTitle = await knex.schema.hasColumn('products', 'seo_title');
  if (!hasTitle) {
    await knex.schema.alterTable('products', table => {
      table.string('seo_title', 120).nullable().after('details');
    });
    await knex.schema.alterTable('products', table => {
      table.string('seo_description', 320).nullable().after('seo_title');
    });
    await knex.schema.alterTable('products', table => {
      table.string('seo_slug', 255).nullable().after('seo_description');
    });
    await knex.schema.alterTable('products', table => {
      table.string('seo_keyword', 120).nullable().after('seo_slug');
    });
    await knex.schema.alterTable('products', table => {
      table.string('seo_canonical', 500).nullable().after('seo_keyword');
    });
    await knex.schema.alterTable('products', table => {
      table.string('seo_og_image', 500).nullable().after('seo_canonical');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('products', table => {
    table.dropColumns('seo_title', 'seo_description', 'seo_slug', 'seo_keyword', 'seo_canonical', 'seo_og_image');
  });
};
