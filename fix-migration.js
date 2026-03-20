const env = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: `.env.${env}` });

const knexConfig = require('./knexfile');
const knex = require('knex')(knexConfig[env]);

async function fix() {
  console.log(`Using environment: ${env}`);
  console.log('Dropping flash_sale_requests table if exists...');
  await knex.raw('DROP TABLE IF EXISTS flash_sale_requests');

  console.log('Cleaning up knex_migrations record...');
  await knex('knex_migrations')
    .where('name', 'like', '%create_flash_sale_requests_table%')
    .delete();

  console.log('Done! Now run: npx knex migrate:latest');
  await knex.destroy();
  process.exit(0);
}

fix().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});