const admin = require('firebase-admin');
const { execute } = require('../configs/db');
const fs = require('fs');
const path = require('path');

// Coba inisialisasi Firebase Admin
try {
  const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[FCM] Firebase Admin initialized successfully');
  } else {
    console.warn('[FCM] WARNING: serviceAccountKey.json not found. Push notifications will not work.');
  }
} catch (error) {
  console.error('[FCM] Error initializing Firebase Admin:', error);
}

/**
 * Mengirim push notification ke user spesifik
 * @param {number} userId 
 * @param {string} title 
 * @param {string} body 
 * @param {object} dataData payloads
 */
const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    // Cari semua token aktif milik user ini
    const queryResult = await execute('SELECT token FROM fcm_tokens WHERE user_id = ?', [userId]);
    const tokens = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
    if (!tokens || tokens.length === 0) {
      console.log(`[FCM] No tokens found for user ${userId}. Skipping push notif.`);
      return;
    }

    const messages = tokens.map(t => ({
      notification: { title, body },
      data,
      token: t.token
    }));

    // Gunakan sendEach untuk banyak device sekaligus (mulai Node Admin SDK v11+)
    const response = await admin.messaging().sendEach(messages);
    console.log(`[FCM] Push sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failed.`);
    
    // Opsional: Hapus token yang sudah Invalid/Unregistered
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code || resp.error?.errorInfo?.code;
          if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
            failedTokens.push(tokens[idx].token);
          } else {
            console.error('[FCM] Token Failure Reason:', errCode, resp.error?.message);
          }
        }
      });
      if (failedTokens.length > 0) {
        await execute('DELETE FROM fcm_tokens WHERE token IN (?)', [failedTokens]);
        console.log(`[FCM] Cleaned up ${failedTokens.length} invalid tokens.`);
      }
    }
  } catch (error) {
    if (error?.message?.includes('messaging/app-deleted') || !admin.apps.length) {
       console.log('[FCM] Push skipped, Admin SDK not initialized (missing serviceAccountKey.json)');
    } else {
       console.error('[FCM] Error sending push notification:', error);
    }
  }
};

module.exports = {
  admin,
  sendPushNotification
};
