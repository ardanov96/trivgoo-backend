require('dotenv').config({ path: '.env.development' });
const { find_user_by_id } = require('./src/models/user');
async function test() {
  const user = await find_user_by_id(68); // ID for njhussrhiee0206@gmail.com
  console.log(user);
  process.exit();
}
test();
