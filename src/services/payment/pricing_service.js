// src/services/payment/pricing_service.js
const { execute } = require('../../configs/db');
const { validate_voucher } = require('../../models/voucher');

// Constants matching frontend implementation
const ADMIN_FEE = 4000;
const DRIVER_PRICE_PER_12H = 150000;
const PREMIUM_INSURANCE = 75000;
const CHILD_SEAT = 50000;
const ALLOWED_TOLERANCE = 5; // allow small rounding differences (Rp 5)

/**
 * Parses safely from JSON string
 */
function safeJsonParse(v, fallback = {}) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hasValue(v) {
  return v !== undefined && v !== null && v !== '';
}

function pickFirst(...values) {
  for (const value of values) {
    if (hasValue(value)) return value;
  }
  return undefined;
}

function parseDateRangeDuration(dateRange) {
  if (!dateRange || typeof dateRange !== 'string' || !dateRange.includes(' - ')) return null;
  const [startStr, endStr] = dateRange.split(' - ');
  if (!startStr || !endStr) return null;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  return diffDays > 0 ? diffDays : null;
}

function parseDateTimeDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  return diffDays > 0 ? diffDays : 1;
}

function normalizePricingContext(payload) {
  const rawContext = safeJsonParse(payload.pricing_context, {});
  const rawAddOns = rawContext.addOns || payload.addOns || {};

  return {
    voucherCode: pickFirst(rawContext.voucherCode, rawContext.voucher_code, payload.voucher_code),
    agentVoucherCode: pickFirst(rawContext.agentVoucherCode, rawContext.agent_voucher_code, payload.agent_voucher_code),
    vehicleType: pickFirst(rawContext.vehicleType, rawContext.vehicle_type, payload.vehicle_type),
    duration: toNumber(
      pickFirst(
        rawContext.duration,
        payload.duration,
        parseDateRangeDuration(payload.date),
        parseDateTimeDuration(payload.start_time, payload.end_time)
      ),
      0
    ),
    pax: toNumber(pickFirst(rawContext.pax, payload.quantity), 1),
    addOns: {
      withDriver: Boolean(rawAddOns.withDriver ?? payload.withDriver),
      premiumInsurance: Boolean(rawAddOns.premiumInsurance ?? payload.premiumInsurance),
      childSeat: Boolean(rawAddOns.childSeat ?? payload.childSeat),
    },
    pickupFee: toNumber(
      pickFirst(rawContext.pickupFee, rawContext.pickup_fee, payload.pickupFee, payload.pickup_fee),
      0
    ),
    dropoffFee: toNumber(
      pickFirst(rawContext.dropoffFee, rawContext.dropoff_fee, payload.dropoffFee, payload.dropoff_fee),
      0
    ),
    hasExplicitCarExtras:
      hasValue(rawContext.pickupFee) ||
      hasValue(rawContext.pickup_fee) ||
      hasValue(rawContext.dropoffFee) ||
      hasValue(rawContext.dropoff_fee) ||
      hasValue(payload.pickupFee) ||
      hasValue(payload.pickup_fee) ||
      hasValue(payload.dropoffFee) ||
      hasValue(payload.dropoff_fee) ||
      rawAddOns.withDriver === true ||
      rawAddOns.premiumInsurance === true ||
      rawAddOns.childSeat === true ||
      payload.withDriver === true ||
      payload.premiumInsurance === true ||
      payload.childSeat === true,
  };
}

/**
 * SECURE PRICING LOGIC
 * Calculates the exact amount that should be charged based on product DB constraints.
 * Uses `pricing_context` to fill in dynamic frontend choices cleanly.
 */
async function calculateFinalAmount(payload) {
  const { amount: frontendAmount, product_id, quantity, user_id } = payload;

  if (!product_id) {
    return {
      final_amount: Number(frontendAmount),
      is_secure: false,
      reason: 'Product checkout now requires product_id for secure backend pricing.',
    };
  }

  const prodRows = await execute('SELECT id, price, details FROM products WHERE id = ? LIMIT 1', [product_id]);
  const items = Array.isArray(prodRows[0]) ? prodRows[0] : prodRows;

  if (!items || items.length === 0) {
    return {
      final_amount: Number(frontendAmount),
      is_secure: false,
      reason: 'Product not found in DB.',
    };
  }

  const product = items[0];
  const basePrice = toNumber(product.price);
  const details = safeJsonParse(product.details);
  const pricingContext = normalizePricingContext({ ...payload, quantity });
  const productType = String(details.type || pricingContext.vehicleType || '').toLowerCase();
  const isCar = productType === 'car';
  const isStay = productType === 'stay';
  const qty = toNumber(quantity || pricingContext.pax || 1, 1);

  let duration = pricingContext.duration;
  if (!duration && !isCar && !isStay) duration = 1;

  if (isStay && !duration) {
    return {
      final_amount: Number(frontendAmount),
      is_secure: false,
      reason: 'Stay booking requires duration/check-out context to be recalculated securely by backend.',
    };
  }

  if (isCar && !duration) {
    return {
      final_amount: Number(frontendAmount),
      is_secure: false,
      reason: 'Car booking requires rental duration (start/end time or pricing_context).',
    };
  }

  let totalProductPrice = 0;
  let addOnsTotal = 0;
  let deliveryTotal = 0;

  if (isCar) {
    const addOns = pricingContext.addOns || {};
    if (addOns.withDriver) addOnsTotal += DRIVER_PRICE_PER_12H;
    if (addOns.premiumInsurance) addOnsTotal += PREMIUM_INSURANCE;
    if (addOns.childSeat) addOnsTotal += CHILD_SEAT;

    totalProductPrice = (basePrice + addOnsTotal) * duration;

    const pFee = Math.max(0, pricingContext.pickupFee);
    const dFee = Math.max(0, pricingContext.dropoffFee);
    deliveryTotal = pFee + dFee;
  } else {
    totalProductPrice = basePrice * qty * duration;
  }

  let subtotal = totalProductPrice + deliveryTotal;
  let voucherDiscount = 0;
  let activeVoucher = null;
  const voucherCode = pricingContext.voucherCode;

  if (voucherCode) {
    const vRes = await validate_voucher(voucherCode, {
      user_id,
      amount: subtotal,
    });
    if (vRes && vRes.valid) {
      voucherDiscount = vRes.discount;
      activeVoucher = vRes.voucher;
    } else {
      return {
        final_amount: Number(frontendAmount),
        is_secure: false,
        reason: vRes?.reason || 'Voucher validation failed.',
      };
    }
  }

  let agentVoucherDiscount = 0;
  let activeAgentVoucher = null;
  const agentVoucherCode = pricingContext.agentVoucherCode;

  if (agentVoucherCode) {
    const remainingSubtotal = Math.max(0, subtotal - voucherDiscount);
    const vRes = await validate_voucher(agentVoucherCode, {
      user_id,
      amount: remainingSubtotal,
    });
    if (vRes && vRes.valid) {
      agentVoucherDiscount = vRes.discount;
      activeAgentVoucher = vRes.voucher;
    } else {
      return {
        final_amount: Number(frontendAmount),
        is_secure: false,
        reason: vRes?.reason || 'Agent voucher validation failed.',
      };
    }
  }

  let totalDiscount = voucherDiscount + agentVoucherDiscount;
  let backendFinalAmount = subtotal - totalDiscount + ADMIN_FEE;
  const diff = Math.abs(backendFinalAmount - toNumber(frontendAmount));

  if (isCar && !pricingContext.hasExplicitCarExtras && diff > ALLOWED_TOLERANCE) {
    return {
      final_amount: backendFinalAmount,
      is_secure: false,
      reason: 'Car booking includes extra charges that backend cannot verify without pricing_context.',
      details: { expected_backend: backendFinalAmount, frontend_amount: frontendAmount },
    };
  }

  if (diff > ALLOWED_TOLERANCE) {
    return {
      final_amount: backendFinalAmount,
      is_secure: false,
      reason: 'Frontend amount does not match secure backend pricing calculation.',
      details: { expected_backend: backendFinalAmount, frontend_amount: frontendAmount },
    };
  }

  return {
    final_amount: backendFinalAmount,
    is_secure: true,
    details: {
      base_price: basePrice,
      duration,
      qty,
      add_ons: addOnsTotal,
      delivery_fee: deliveryTotal,
      subtotal,
      voucher_discount: voucherDiscount,
      agent_voucher_discount: agentVoucherDiscount,
      total_discount: totalDiscount,
      admin_fee: ADMIN_FEE,
      voucher_used: activeVoucher ? activeVoucher.code : null,
      agent_voucher_used: activeAgentVoucher ? activeAgentVoucher.code : null
    }
  };
}

module.exports = {
  calculateFinalAmount,
  ADMIN_FEE
};
