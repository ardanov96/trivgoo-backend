const db = require('../configs/db');
const misc = require('../helpers/response');
const { update_verification_status } = require('../models/user');
const { update_agent_verification_status } = require('../models/agent');
const {
  list_agent_users_with_verification, 
  list_customer_users,
  list_agent_products_admin,
  get_agent_product_detail_admin,
  get_dashboard_summary,
} = require('../models/admin');

function normalize_verification_action(action) {
  const upper = String(action || '').toUpperCase();
  if (upper === 'APPROVE') return 'VERIFIED';
  if (upper === 'REJECT') return 'REJECTED';
  return null;
}

function ensure_admin(req) {
  const user = req?.session?.user || null;

  if (!user) {
    const err = new Error('Unauthorized');
    err.status_code = 401;
    throw err;
  }

  if (user.role !== 'ADMIN') {
    const err = new Error('Forbidden');
    err.status_code = 403;
    throw err;
  }

  return user;
}

async function list_agents(req, res) {
  try {
    ensure_admin(req);
    
    const data = await list_agent_users_with_verification(); 
    
    return misc.response(res, 200, false, 'OK', data);
  } catch (err) {
    console.error(err);
    return misc.response(res, err.status_code || 500, true, err.message || 'Internal server error');
  }
}

async function list_customers(req, res) {
  try {
    ensure_admin(req);
    const data = await list_customer_users();
    return misc.response(res, 200, false, 'OK', data);
  } catch (err) {
    console.error(err);
    return misc.response(res, err.status_code || 500, true, err.message || 'Internal server error');
  }
}

async function list_agent_products(req, res) {
  try {
    ensure_admin(req);

    const { owner_id, q, page, limit } = req.query;

    const result = await list_agent_products_admin({
      owner_id,
      q,
      page,
      limit,
    });

    return misc.response(res, 200, false, 'OK', result);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function get_agent_product_detail(req, res) {
  try {
    ensure_admin(req);

    const product_id = Number(req.params.product_id);
    if (!Number.isFinite(product_id) || product_id <= 0) {
      return misc.response(res, 400, true, 'product_id tidak valid');
    }

    const data = await get_agent_product_detail_admin(product_id);
    if (!data) {
      return misc.response(res, 404, true, 'Product not found');
    }

    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function update_agent_verification(req, res) {
  try {
    ensure_admin(req);

    const user_id = req.params.user_id;
    const { action } = req.body || {};

    const new_status = normalize_verification_action(action);
    if (!new_status) {
      return misc.response(res, 400, true, 'action harus APPROVE atau REJECT');
    }

    await update_verification_status(user_id, new_status);
    await update_agent_verification_status(user_id, new_status);

    return misc.response(res, 200, false, `Agent verification ${new_status}`);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function dashboard_summary(req, res) {
  try {
    ensure_admin(req);

    const { range } = req.query;
    
    // Tambahkan 'all' ke dalam validRanges
    const validRanges = ['all', '7days', 'month', 'year'];
    // Jika tidak ada di list, default ke 'all' (atau '7days' sesuai keinginan Anda)
    const selectedRange = validRanges.includes(range) ? range : 'all';

    const summary = await get_dashboard_summary({ range: selectedRange });

    return misc.response(res, 200, false, 'OK', summary);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * Recovery function: Scan corporate users' documents and fix missing id_document_url
 * This helps recover from cases where files were uploaded but paths weren't stored correctly
 */
async function recover_corporate_documents(req, res) {
  try {
    ensure_admin(req);
    
    const fs = require('fs');
    const path = require('path');
    
    const corporateDir = path.join(__dirname, '../../public/users/corporate');
    
    if (!fs.existsSync(corporateDir)) {
      return misc.response(res, 400, true, 'Corporate documents directory does not exist');
    }
    
    const files = fs.readdirSync(corporateDir);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
    
    console.log(`[RECOVERY] Found ${pdfFiles.length} PDF files in corporate directory`);
    
    let fixed = 0;
    const results = [];
    
    for (const file of pdfFiles) {
      try {
        // Extract user_id from filename (format: {user_id}_{name}.pdf)
        const userIdMatch = file.match(/^(\d+)_/);
        if (!userIdMatch) {
          console.log(`[RECOVERY] Skipping file with invalid format: ${file}`);
          continue;
        }
        
        const userId = parseInt(userIdMatch[1], 10);
        const docUrl = `/users/corporate/${file}`;
        
        // Check if this user has a verification record
        const [verificationRows] = await db.query(
          'SELECT id, id_document_url FROM agent_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1',
          [userId]
        );
        
        if (verificationRows.length === 0) {
          console.log(`[RECOVERY] No verification record for user ${userId}`);
          results.push({ file, userId, status: 'no_record', docUrl });
          continue;
        }
        
        const verification = verificationRows[0];
        
        // If id_document_url is already set correctly, skip
        if (verification.id_document_url === docUrl) {
          results.push({ file, userId, status: 'already_correct', docUrl });
          continue;
        }
        
        // Update the verification record with correct path
        await db.query(
          'UPDATE agent_verifications SET id_document_url = ? WHERE id = ?',
          [docUrl, verification.id]
        );
        
        fixed++;
        console.log(`[RECOVERY] Fixed user ${userId}: set id_document_url to ${docUrl}`);
        results.push({ file, userId, status: 'fixed', docUrl });
        
      } catch (err) {
        console.error(`[RECOVERY] Error processing file ${file}:`, err);
        results.push({ file, status: 'error', error: err.message });
      }
    }
    
    return misc.response(res, 200, false, `Recovery complete: ${fixed} records fixed`, {
      fixed,
      total_files: pdfFiles.length,
      results
    });
  } catch (e) {
    console.error('[RECOVERY ERROR]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Recovery failed');
  }
}

module.exports = {
  list_agents,
  list_customers,
  list_agent_products,
  get_agent_product_detail,
  update_agent_verification,
  dashboard_summary,
  recover_corporate_documents,
};