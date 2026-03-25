/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE users
    MODIFY COLUMN verification_status
    ENUM('UNVERIFIED', 'WAITING_DOCUMENT', 'PENDING', 'VERIFIED', 'REJECTED')
    DEFAULT 'UNVERIFIED'
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.raw(`
    UPDATE users
    SET verification_status = 'UNVERIFIED'
    WHERE verification_status = 'WAITING_DOCUMENT'
  `);

  await knex.raw(`
    ALTER TABLE users
    MODIFY COLUMN verification_status
    ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED')
    DEFAULT 'UNVERIFIED'
  `);
};
