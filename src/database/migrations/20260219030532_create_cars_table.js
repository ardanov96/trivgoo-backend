/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('cars', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable(); // Contoh: Toyota Avanza
    table.string('slug').unique().notNullable(); // Untuk URL ramah SEO
    
    table.string('brand').notNullable(); // Contoh: Toyota, Honda
    table.string('model_year').nullable(); // Contoh: 2023
    
    // Spesifikasi Teknis
    table.enum('transmission', ['Manual', 'Automatic']).defaultTo('Manual');
    table.integer('seats').defaultTo(4); // Kapasitas penumpang
    table.string('fuel_type').nullable(); // Bensin, Diesel, Electric
    
    // Media & Deskripsi
    table.string('image').nullable();
    table.text('description').nullable();
    
    table.timestamps(true, true); 
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('cars');
};