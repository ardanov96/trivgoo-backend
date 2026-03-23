const userModel = require('../models/user');
const misc = require('../helpers/response');

module.exports = {
  update_my_profile: async (req, res) => {
    try {
      const userId = req.session?.user?.id;
      const { name, avatar_url, current_password, new_password } = req.body;

      // Jika ingin ganti password, wajib verifikasi password lama
      if (new_password) {
        if (!current_password) {
          return misc.response(res, 400, true, 'Password saat ini wajib diisi untuk mengganti password baru');
        }
        const isMatch = await userModel.verify_password(userId, current_password);
        if (!isMatch) {
          return misc.response(res, 400, true, 'Password saat ini salah');
        }
      }

      await userModel.update_user_profile(userId, { name, avatar_url, new_password });
      
      return misc.response(res, 200, false, 'Profil berhasil diperbarui');
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message);
    }
  },

  save_fcm_token: async (req, res) => {
    try {
      const userId = req.session?.user?.id || req.user?.id;
      if (!userId) return misc.response(res, 401, true, 'Unauthorized');

      const { token, device_type } = req.body;
      if (!token) return misc.response(res, 400, true, 'FCM Token wajib disertakan');

      const { execute } = require('../configs/db');
      
      // Upsert token
      await execute(`
        INSERT INTO fcm_tokens (user_id, token, device_type) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `, [userId, token, device_type || 'web']);

      return misc.response(res, 200, false, 'FCM Token berhasil disimpan');
    } catch (error) {
      console.error('[UserController] Failed to save FCM token:', error);
      return misc.response(res, 500, true, 'Terjadi kesalahan server saat menyimpan FCM Token');
    }
  }
};