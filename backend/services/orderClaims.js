import { pool } from '../db/pool.js';

export async function claimGuestOrdersForUser(userId, client = pool) {
  const { rows: users } = await client.query(
    'SELECT email FROM users WHERE id = $1 AND email_verified_at IS NOT NULL',
    [userId],
  );
  if (!users.length) return 0;
  const { rowCount } = await client.query(
    `UPDATE orders
     SET user_id = $1
     WHERE user_id IS NULL AND LOWER(customer_email) = LOWER($2)`,
    [userId, users[0].email],
  );
  return rowCount;
}
