/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. product_images
  const hasImages = await knex.schema.hasTable('product_images');
  if (!hasImages) {
    await knex.schema.createTable('product_images', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('product_id').unsigned().notNullable();
      table.string('image_url', 1000).notNullable();
      table.integer('sort_order').notNullable().defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['product_id', 'sort_order'], 'idx_pi_product');
    });
  }

  // 2. product_blocked_dates
  const hasBlocked = await knex.schema.hasTable('product_blocked_dates');
  if (!hasBlocked) {
    await knex.schema.createTable('product_blocked_dates', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('product_id').unsigned().notNullable();
      table.date('blocked_date').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['product_id', 'blocked_date'], 'uq_pbd');
    });
  }

  // 3. booking_locks
  const hasLocks = await knex.schema.hasTable('booking_locks');
  if (!hasLocks) {
    await knex.schema.createTable('booking_locks', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').unsigned().nullable();
      table.string('cart_token', 255).nullable();
      table.bigInteger('product_id').unsigned().notNullable();
      table.integer('quantity').notNullable().defaultTo(1);
      table.date('start_date').nullable();
      table.date('end_date').nullable();
      table.string('status', 50).notNullable().defaultTo('PENDING');
      table.timestamp('expires_at').nullable();
      table.json('metadata').nullable();
      table.timestamps(true, true);
      table.index(['user_id', 'cart_token', 'product_id', 'status'], 'idx_bl_user_cart');
    });
  }

  // 4. saved_itineraries
  const hasSaved = await knex.schema.hasTable('saved_itineraries');
  if (!hasSaved) {
    await knex.schema.createTable('saved_itineraries', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').unsigned().notNullable();
      table.string('title', 255).notNullable();
      table.text('user_story').nullable();
      table.text('itinerary', 'longtext').notNullable();
      table.json('recommended_products').nullable();
      table.string('share_token', 100).notNullable().unique();
      table.timestamps(true, true);
      table.index(['user_id'], 'idx_si_user');
    });
  }

  // 5. ai_impressions
  const hasImp = await knex.schema.hasTable('ai_impressions');
  if (!hasImp) {
    await knex.schema.createTable('ai_impressions', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('product_id').unsigned().notNullable();
      table.bigInteger('user_id').unsigned().nullable();
      table.text('query_snippet').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['product_id'], 'idx_ai_imp_prod');
    });
  }

  // 6. knowledge_base
  const hasKb = await knex.schema.hasTable('knowledge_base');
  if (!hasKb) {
    await knex.schema.createTable('knowledge_base', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('agent_id').unsigned().notNullable();
      table.string('location', 255).notNullable();
      table.string('tip_type', 100).notNullable();
      table.string('title', 255).notNullable();
      table.text('content').notNullable();
      table.string('valid_months', 100).nullable();
      table.boolean('is_approved').notNullable().defaultTo(true);
      table.timestamps(true, true);
      table.index(['location'], 'idx_kb_loc');
    });
  }

  // 7. bank_change_requests
  const hasBankReq = await knex.schema.hasTable('bank_change_requests');
  if (!hasBankReq) {
    await knex.schema.createTable('bank_change_requests', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('user_id').unsigned().notNullable();
      table.string('bank_name', 100).notNullable();
      table.string('bank_account_number', 100).notNullable();
      table.string('bank_account_holder', 255).notNullable();
      table.string('status', 50).notNullable().defaultTo('pending');
      table.text('rejection_reason').nullable();
      table.timestamps(true, true);
      table.index(['user_id', 'status'], 'idx_bcr_user');
    });
  }

  // 8. columns on products
  const hasFlashSale = await knex.schema.hasColumn('products', 'is_flash_sale');
  if (!hasFlashSale) {
    await knex.schema.alterTable('products', (table) => {
      table.boolean('is_flash_sale').notNullable().defaultTo(false);
      table.decimal('flash_sale_price', 15, 2).nullable();
      table.integer('flash_discount_pct').nullable();
      table.dateTime('flash_ends_at').nullable();
    });
  }

  // 9. columns on vouchers
  const hasScopeOwner = await knex.schema.hasColumn('vouchers', 'scope_owner');
  if (!hasScopeOwner) {
    await knex.schema.alterTable('vouchers', (table) => {
      table.string('scope_owner', 50).notNullable().defaultTo('admin');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('bank_change_requests')
    .dropTableIfExists('knowledge_base')
    .dropTableIfExists('ai_impressions')
    .dropTableIfExists('saved_itineraries')
    .dropTableIfExists('booking_locks')
    .dropTableIfExists('product_blocked_dates')
    .dropTableIfExists('product_images');
};
