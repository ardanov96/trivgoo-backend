exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('flash_sale_requests');
  if (exists) return;
  return knex.schema.createTable('flash_sale_requests', (table) => {
    table.increments('id').primary();
    table.integer('product_id').notNullable();
    table.integer('agent_id').notNullable();
    table.decimal('discount_pct', 5, 2).notNullable();
    table.decimal('sale_price', 15, 2).nullable();
    table.enu('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    table.integer('campaign_id').nullable();
    table.text('admin_note').nullable();
    table.timestamps(true, true);

    table.index('product_id',  'idx_fsr_product_id');
    table.index('agent_id',    'idx_fsr_agent_id');
    table.index('status',      'idx_fsr_status');
    table.index('campaign_id', 'idx_fsr_campaign_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('flash_sale_requests');
};
