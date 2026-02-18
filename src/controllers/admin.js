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

module.exports = {
  list_agents,
  list_customers,
  list_agent_products,
  get_agent_product_detail,
  update_agent_verification,
  dashboard_summary,
};