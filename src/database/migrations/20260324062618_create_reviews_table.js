/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('reviews', (table) => {
    table.increments('id').primary();
    
    // Foreign keys (user_id & product_id = bigint to match parent tables)
    table.bigInteger('user_id').unsigned().notNullable();
    table.bigInteger('product_id').unsigned().notNullable();
    table.integer('booking_id').unsigned().notNullable();
    
    // Core data
    table.integer('rating').notNullable(); // 1 to 5
    table.text('comment').nullable();
    
    // Sentiment (auto-calculated)
    table.enum('sentiment', ['positive', 'neutral', 'negative']).notNullable();
    
    // Agent reply
    table.text('agent_reply').nullable();
    table.timestamp('agent_reply_at').nullable();
    
    // Moderation
    table.boolean('is_flagged').defaultTo(false);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Constraints & Indexes
    table.unique(['booking_id']); // 1 booking = 1 review
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.foreign('booking_id').references('id').inTable('bookings').onDelete('CASCADE');
    
    // Indexes for querying
    table.index(['product_id', 'created_at']);
    table.index(['user_id', 'created_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('reviews');
};
