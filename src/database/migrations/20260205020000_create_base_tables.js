/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Base users table
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    await knex.schema.createTable('users', (table) => {
      table.bigIncrements('id').primary();
      table.string('name', 255).notNullable();
      table.string('email', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.string('role', 50).notNullable().defaultTo('CUSTOMER');
      table.string('specialization', 100).nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.string('verification_status', 50).notNullable().defaultTo('UNVERIFIED');
      table.timestamps(true, true);
    });
  }

  // 2. Base products table
  const hasProducts = await knex.schema.hasTable('products');
  if (!hasProducts) {
    await knex.schema.createTable('products', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('owner_id').unsigned().notNullable();
      table.integer('category_id').unsigned().nullable();
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.decimal('price', 14, 2).notNullable().defaultTo(0);
      table.string('currency', 10).notNullable().defaultTo('IDR');
      table.string('location', 255).nullable();
      table.string('lat', 50).nullable();
      table.string('lng', 50).nullable();
      table.string('image_url', 500).nullable();
      table.json('features').nullable();
      table.json('details').nullable();
      table.integer('daily_capacity').notNullable().defaultTo(10);
      table.decimal('rating', 3, 2).notNullable().defaultTo(0);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamps(true, true);

      table.index('owner_id');
      table.index('category_id');
    });
  }

  // 3. Base agent_verifications table
  const hasAgentVerifications = await knex.schema.hasTable('agent_verifications');
  if (!hasAgentVerifications) {
    await knex.schema.createTable('agent_verifications', (table) => {
      table.increments('id').primary();
      table.bigInteger('user_id').unsigned().notNullable().unique();
      table.string('agent_type', 50).nullable();
      table.string('specialization', 100).nullable();
      table.string('id_card_number', 100).nullable();
      table.string('tax_id', 100).nullable();
      table.string('company_name', 255).nullable();
      table.string('bank_name', 100).nullable();
      table.string('bank_account_number', 100).nullable();
      table.string('bank_account_holder', 100).nullable();
      table.string('id_document_url', 500).nullable();
      table.enum('status', ['PENDING', 'VERIFIED', 'REJECTED']).defaultTo('PENDING');
      table.text('rejection_reason').nullable();
      table.datetime('reviewed_at').nullable();
      table.bigInteger('reviewed_by').unsigned().nullable();
      table.timestamps(true, true);
    });
  }

  // 4. Base user_profiles table
  const hasUserProfiles = await knex.schema.hasTable('user_profiles');
  if (!hasUserProfiles) {
    await knex.schema.createTable('user_profiles', (table) => {
      table.increments('id').primary();
      table.bigInteger('user_id').unsigned().notNullable().unique();
      table.string('phone', 50).nullable();
      table.text('address').nullable();
      table.text('address_line').nullable();
      table.string('avatar_url', 500).nullable();
      table.timestamps(true, true);
    });
  }

  // 5. Base password_reset_tokens table
  const hasPasswordResetTokens = await knex.schema.hasTable('password_reset_tokens');
  if (!hasPasswordResetTokens) {
    await knex.schema.createTable('password_reset_tokens', (table) => {
      table.increments('id').primary();
      table.bigInteger('user_id').unsigned().notNullable();
      table.string('token', 255).notNullable().unique();
      table.datetime('expires_at').notNullable();
      table.boolean('used').notNullable().defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('user_id');
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('password_reset_tokens');
  await knex.schema.dropTableIfExists('user_profiles');
  await knex.schema.dropTableIfExists('agent_verifications');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('users');
};
