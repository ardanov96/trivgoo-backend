/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // 1. Expand enum to include new referral reward types
  await knex.raw(`
    ALTER TABLE point_transactions 
    MODIFY COLUMN type ENUM(
      'earn_purchase',
      'earn_referral',
      'earn_referral_verify',
      'earn_referral_booking',
      'earn_review',
      'earn_birthday',
      'earn_campaign',
      'spend_redemption',
      'spend_checkout',
      'expired',
      'adjustment'
    ) NOT NULL
  `);

  // 2. Add unique constraint to prevent double reward
  //    (same sponsor cannot get same reward type for the same referred user twice)
  const [rows] = await knex.raw(`
    SELECT COUNT(*) as cnt 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'point_transactions' 
      AND INDEX_NAME = 'unique_reward'
  `);
  if (!rows[0] || rows[0].cnt === 0) {
    await knex.raw(`
      ALTER TABLE point_transactions
      ADD UNIQUE KEY unique_reward (user_id, ref_type, ref_id)
    `);
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Remove unique constraint
  const [rows] = await knex.raw(`
    SELECT COUNT(*) as cnt 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'point_transactions' 
      AND INDEX_NAME = 'unique_reward'
  `);
  if (rows[0] && rows[0].cnt > 0) {
    await knex.raw(`ALTER TABLE point_transactions DROP INDEX unique_reward`);
  }

  // Revert enum
  await knex.raw(`
    ALTER TABLE point_transactions 
    MODIFY COLUMN type ENUM(
      'earn_purchase',
      'earn_referral',
      'earn_review',
      'earn_birthday',
      'earn_campaign',
      'spend_redemption',
      'spend_checkout',
      'expired',
      'adjustment'
    ) NOT NULL
  `);
};
