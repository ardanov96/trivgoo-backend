/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('bookings', (table) => {
    table.increments('id').primary();
    
    // Ganti .integer menjadi .bigInteger agar kompatibel dengan increments('id')
    table.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users')
      .onDelete('CASCADE');

    table.bigInteger('product_id').unsigned().notNullable()
      .references('id').inTable('products')
      .onDelete('RESTRICT');

    table.string('product_name').notNullable();
    table.string('user_name').nullable();
    table.integer('quantity').defaultTo(1);
    table.decimal('total_price', 12, 2).notNullable();
    table.date('date').notNullable();

    table.enum('status', ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'])
      .defaultTo('PENDING')
      .notNullable();

    table.timestamps(true, true); 
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('bookings');
};