const path = require('path');
const fs = require('fs');

const misc = require('../helpers/response');
const {
  upsert_agent_verification,
  find_verification_by_user_id,
  get_agent_dashboard_stats,
  get_agent_weekly_sales,
} = require('../models/agent');

const { update_verification_status } = require('../models/user');

function normalize_agent_type(agent_type) {
  const allowed = new Set(['INDIVIDUAL', 'CORPORATE']);
  const upper = String(agent_type || 'INDIVIDUAL').toUpperCase();
  return allowed.has(upper) ? upper : 'INDIVIDUAL';
}

function normalize_agent_specialization(specialization) {
  const allowed = new Set(['TOUR', 'STAY', 'TRANSPORT']);
  const upper = String(specialization || 'TOUR').toUpperCase();
  return allowed.has(upper) ? upper : 'TOUR';
}

module.exports = {
  submit_verification: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      const {
        agent_type,
        id_card_number,
        tax_id,
        company_name,
        bank_name,
        bank_account_number,
        bank_account_holder,
        specialization,
      } = req.body;

      if (!id_card_number || !tax_id || !bank_name || !bank_account_number || !bank_account_holder) {
        return misc.response(res, 400, true, 'Semua field wajib diisi');
      }

      // ✅ Read file path from multer (req.file), fallback to null if no file uploaded
      let id_document_url = null;
      if (req.file) {
        // Normalize path: convert backslashes to forward slashes
        const normalizedPath = req.file.path.replace(/\\/g, '/');
        console.log(`[AGENT] File uploaded to: ${req.file.path}`);
        console.log(`[AGENT] Normalized path: ${normalizedPath}`);
        
        // Remove public/ prefix if present
        let cleanPath = normalizedPath.replace(/^public\//, '');
        console.log(`[AGENT] After removing public/: ${cleanPath}`);
        
        // Ensure leading slash
        id_document_url = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
        console.log(`[AGENT] Final document URL: ${id_document_url}`);
      }

      if (!id_document_url) {
        return misc.response(res, 400, true, 'Document upload is required');
      }

      const norm_agent_type = normalize_agent_type(agent_type);
      const norm_specialization = normalize_agent_specialization(specialization);

      const payload = {
        user_id,
        agent_type: norm_agent_type,
        specialization: norm_specialization,
        id_card_number,
        tax_id,
        company_name: company_name ? String(company_name).trim() : null,
        bank_name,
        bank_account_number,
        bank_account_holder,
        id_document_url,  // ✅ now comes from req.file, not req.body
      };

      await upsert_agent_verification(payload);
      await update_verification_status(user_id, 'PENDING');

      return misc.response(res, 200, false, 'Verification submitted, status PENDING');
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  get_my_verification: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      const verification = await find_verification_by_user_id(user_id);
      return misc.response(res, 200, false, 'OK', verification);
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  /**
   * NEW: Get agent dashboard statistics
   * GET /api/v1/agent/dashboard/stats
   */
  get_agent_dashboard_stats: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      // Pastikan user adalah agent
      const user_role = req.session?.user?.role;
      if (user_role !== 'AGENT') {
        return misc.response(res, 403, true, 'Forbidden: Only agents can access this endpoint');
      }

      const stats = await get_agent_dashboard_stats(user_id);
      return misc.response(res, 200, false, 'OK', stats);
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  /**
   * NEW: Get agent weekly sales data
   * GET /api/v1/agent/dashboard/weekly-sales
   */
  get_weekly_sales: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      // Pastikan user adalah agent
      const user_role = req.session?.user?.role;
      if (user_role !== 'AGENT') {
        return misc.response(res, 403, true, 'Forbidden: Only agents can access this endpoint');
      }

      const sales = await get_agent_weekly_sales(user_id);
      return misc.response(res, 200, false, 'OK', sales);
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },
};