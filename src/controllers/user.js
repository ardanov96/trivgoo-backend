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
  }
};