/**
 * autoPayout.js
 * Daily cron job that automatically creates pending withdrawal records
 * for photographers whose available balance exceeds KES 500.
 *
 * Schedule: every day at 23:00 East Africa Time (UTC+3)
 * Cron expr : 0 23 * * *  (TZ = Africa/Nairobi)
 */

import cron from 'node-cron';
import User from '../models/users.js';
import Wallet from '../models/Wallet.js';
import Withdrawal from '../models/Withdrawal.js';
import { getIO } from '../services/socketService.js';

const BALANCE_THRESHOLD = 500; // KES

async function runAutoPayout() {
  console.log('[autoPayout] Starting daily auto-payout job...');

  try {
    // Find all wallets whose balance exceeds the threshold
    const eligibleWallets = await Wallet.find({
      balance: { $gt: BALANCE_THRESHOLD }
    }).populate('user', 'username email phoneNumber role');

    if (!eligibleWallets.length) {
      console.log('[autoPayout] No photographers with balance > KES 500. Nothing to do.');
      return;
    }

    let created = 0;
    let skipped = 0;

    for (const wallet of eligibleWallets) {
      const user = wallet.user;

      // Only process photographers
      if (!user || user.role !== 'photographer') {
        skipped++;
        continue;
      }

      // Skip if photographer has no phone number (needed for M-Pesa)
      if (!user.phoneNumber) {
        console.warn(`[autoPayout] Skipping ${user.username} — no phone number on file.`);
        skipped++;
        continue;
      }

      try {
        const payoutAmount = wallet.balance;

        const withdrawal = await Withdrawal.create({
          photographer: user._id,
          amount: payoutAmount,
          method: 'mpesa',
          phoneNumber: user.phoneNumber,
          status: 'pending',
          isAutomatic: true,
          notes: `Auto-payout triggered on ${new Date().toISOString()}`
        });

        // Deduct balance so the same funds are not paid out again tomorrow
        wallet.balance = 0;
        await wallet.save();

        console.log(
          `[autoPayout] Created withdrawal ${withdrawal.reference} for ${user.username} — KES ${payoutAmount}`
        );

        // Emit socket notification to the photographer if socket is available
        try {
          const io = getIO();
          if (io) {
            io.emit(`notification:${user._id.toString()}`, {
              type: 'auto_payout',
              message: `Your automatic payout of KES ${wallet.balance} has been queued.`,
              withdrawalId: withdrawal._id,
              amount: wallet.balance,
              createdAt: withdrawal.createdAt
            });
          }
        } catch (socketErr) {
          // Socket not available — silently continue
          console.warn('[autoPayout] Socket emit skipped:', socketErr.message);
        }

        created++;
      } catch (createErr) {
        console.error(
          `[autoPayout] Failed to create withdrawal for ${user?.username}:`,
          createErr.message
        );
      }
    }

    console.log(
      `[autoPayout] Done. Created: ${created}, Skipped: ${skipped}, Total eligible: ${eligibleWallets.length}`
    );
  } catch (err) {
    console.error('[autoPayout] Job failed with error:', err.message);
  }
}

/**
 * Start the daily auto-payout cron job.
 * Called once from server.js after the DB connection is established.
 */
export function startAutoPayout() {
  // 0 23 * * *  = 23:00 every day, Africa/Nairobi timezone (EAT = UTC+3)
  cron.schedule('0 23 * * *', runAutoPayout, {
    timezone: 'Africa/Nairobi'
  });

  console.log('[autoPayout] Cron job scheduled — runs daily at 23:00 EAT (Africa/Nairobi)');
}

export default startAutoPayout;
