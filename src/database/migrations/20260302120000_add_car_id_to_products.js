exports.up = function(knex) {
  return knex.schema.table('products', function(table) {
    // position column after image_url when database supports it (e.g. MySQL)
    table.integer('car_id').unsigned().nullable().comment('Associated car for transport products')
      .after('image_url');
    // optionally add foreign key if cars table exists
    // table.foreign('car_id').references('cars.id');
  });
};

exports.down = function(knex) {
  return knex.schema.table('products', function(table) {
    // drop foreign key first if you added one
    // table.dropForeign('car_id');
    table.dropColumn('car_id');
  });
};
