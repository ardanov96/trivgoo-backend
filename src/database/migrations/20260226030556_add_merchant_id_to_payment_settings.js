exports.up = function(knex) {
  return knex.schema.alterTable('payment_settings', (table) => {
    table.string('midtrans_merchant_id').nullable()
      .after('is_test_mode')
      .comment('Midtrans Merchant ID from dashboard');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('payment_settings', (table) => {
    table.dropColumn('midtrans_merchant_id');
  });
};