exports.up = function(knex) {
  return knex.schema.alterTable('agent_verifications', function(table) {
    table.string('sk_document_url').nullable().after('id_document_url');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('agent_verifications', function(table) {
    table.dropColumn('sk_document_url');
  });
};
