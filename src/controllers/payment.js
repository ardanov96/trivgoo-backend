// src/controllers/payment.js
const misc = require('../helpers/response');
const { execute, query } = require('../configs/db');
const { send_payment_success_email, send_new_booking_notification_email } = require('../helpers/mailer');
const { sendPushNotification } = require('../helpers/fcm');
const { getGatewayModule, status_mapper, config_resolver, doku } = require('../services/payment');
const { calculateFinalAmount } = require('../services/payment/pricing_service');
const PaymentTransaction = require('../models/payment_transaction');

function toMySQLDatetime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  // Use local time components to avoid UTC conversion
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getHeaderValue(headers = {}, name) {
  const direct = headers[name];
  if (direct !== undefined) return direct;
  const lower = headers[String(name).toLowerCase()];
  if (lower !== undefined) return lower;

  const normalizedName = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === normalizedName) return value;
  }
  return undefined;
}

function normalizeHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function deriveWebhookEventId(gatewayName, notification, headers, rawStatus, invoiceNumber) {
  if (gatewayName === 'xendit') {
    const webhookId = getHeaderValue(headers, 'webhook-id');
    if (webhookId) return String(webhookId);
  }

  const requestId = getHeaderValue(headers, 'request-id');
  if (requestId) return String(requestId);

  const timestamp =
    getHeaderValue(headers, 'request-timestamp') ||
    notification?.created ||
    notification?.transaction?.date ||
    '';

  const parts = [gatewayName, invoiceNumber, rawStatus, timestamp].filter(Boolean);
  return parts.length ? parts.join(':') : null;
}

function mapPaymentStatusToBookingStatus(currentBookingStatus, paymentStatus) {
  if (paymentStatus === 'PAID') return 'CONFIRMED';
  if (['FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'].includes(paymentStatus)) {
    return currentBookingStatus === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED';
  }
  return currentBookingStatus || 'PENDING';
}

async function get_commission_rate(specialization = null) {
  try {
    const rows = await execute(
      `SELECT commission_rate, commission_rate_tour, commission_rate_transport
       FROM settings WHERE id = 1 LIMIT 1`
    );
    const data = Array.isArray(rows[0]) ? rows[0] : rows;
    const s = data && data[0] ? data[0] : null;
    if (!s) return 11;

    const spec = String(specialization || '').toUpperCase();
    if (spec === 'TOUR')      return Number(s.commission_rate_tour      ?? s.commission_rate ?? 11);
    if (spec === 'TRANSPORT') return Number(s.commission_rate_transport ?? s.commission_rate ?? 11);
    if (spec === 'STAY')      return 0;

    return Number(s.commission_rate ?? 11);
  } catch {
    return 11;
  }
}

async function apply_commission(booking_id, total_price) {
  let specialization = null;
  try {
    const agentRows = await execute(
      `SELECT u.specialization
       FROM bookings b
       JOIN products p ON b.product_id = p.id
       JOIN users u ON p.owner_id = u.id
       WHERE b.id = ? LIMIT 1`,
      [booking_id]
    );
    const agentData = Array.isArray(agentRows[0]) ? agentRows[0] : agentRows;
    specialization = agentData?.[0]?.specialization ?? null;
  } catch {
    specialization = null;
  }

  const rate              = await get_commission_rate(specialization);
  const commission_amount = Math.round((Number(total_price) * rate) / 100);
  const agent_earnings    = Math.round(Number(total_price) - commission_amount);

  await execute(
    `UPDATE bookings
       SET commission_rate   = ?,
           commission_amount = ?,
           agent_earnings    = ?
     WHERE id = ?`,
    [rate, commission_amount, agent_earnings, booking_id]
  );
  return { rate, commission_amount, agent_earnings };
}

/**
 * Executes side effects once a payment becomes PAID (Commission, Kicking Competitors, Mails)
 */
async function _onPaymentPaid(currentBooking, resultInvoiceNumber, notification) {
  // 1. COMMISSION
  if (currentBooking?.id && currentBooking?.total_price) {
    try {
      await apply_commission(currentBooking.id, currentBooking.total_price);
    } catch (commErr) {
      console.error('[COMMISSION] Failed to apply commission:', commErr.message);
    }
  }

  // 2. KICK COMPETITORS
  try {
    if (currentBooking && currentBooking.product_id) {
      const prodResult = await execute('SELECT daily_capacity FROM products WHERE id = ? LIMIT 1', [currentBooking.product_id]);
      const prodRows = Array.isArray(prodResult[0]) ? prodResult[0] : prodResult;
      const actualCapacity = prodRows && prodRows.length > 0 && prodRows[0].daily_capacity != null ? Number(prodRows[0].daily_capacity) : 1;

      let bookingSumResult;
      if (currentBooking.start_time && currentBooking.end_time) {
        bookingSumResult = await query(
           `SELECT SUM(quantity) as total_booked FROM bookings 
            WHERE product_id = ? AND start_time < ? AND end_time > ? AND status != 'CANCELLED' 
            AND payment_status = 'PAID'`,
           [currentBooking.product_id, currentBooking.end_time, currentBooking.start_time]
         );
       } else {
         bookingSumResult = await query(
           `SELECT SUM(quantity) as total_booked FROM bookings 
            WHERE product_id = ? AND date = ? AND status != 'CANCELLED' 
            AND payment_status = 'PAID'`,
           [currentBooking.product_id, currentBooking.date]
         );
       }
      const sumRows = Array.isArray(bookingSumResult[0]) ? bookingSumResult[0] : bookingSumResult;
      const totalBooked = sumRows && sumRows[0].total_booked ? Number(sumRows[0].total_booked) : 0;

      if (totalBooked >= actualCapacity) {
        let competitorsResult;

        if (currentBooking.start_time && currentBooking.end_time) {
          competitorsResult = await query(
            `SELECT id, external_id, payment_request_id, payment_gateway 
             FROM bookings WHERE product_id = ? AND start_time < ? AND end_time > ? AND status = 'PENDING' AND id != ?`,
            [currentBooking.product_id, currentBooking.end_time, currentBooking.start_time, currentBooking.id]
          );
        } else if (currentBooking.date) {
          competitorsResult = await query(
            `SELECT id, external_id, payment_request_id, payment_gateway 
             FROM bookings WHERE product_id = ? AND date = ? AND status = 'PENDING' AND id != ?`,
            [currentBooking.product_id, currentBooking.date, currentBooking.id]
          );
        }

        const competitors = competitorsResult ? (Array.isArray(competitorsResult[0]) ? competitorsResult[0] : competitorsResult) : [];

         if (competitors && competitors.length > 0) {
           for (const comp of competitors) {
             try {
               if (comp.payment_gateway) {
                 const latestTransaction = await PaymentTransaction.findLatestByExternalId(comp.external_id, comp.payment_gateway);
                 const gatewayConfig = await config_resolver.getGatewayConfig(comp.payment_gateway);
                 const gatewayMod = getGatewayModule(comp.payment_gateway);
                 await gatewayMod.cancelTransaction(
                   comp.external_id,
                   gatewayConfig,
                   comp.payment_request_id,
                   latestTransaction?.gateway_invoice_id || comp.payment_request_id || null
                 );
               }
             } catch (ignore) {}
             await execute(`UPDATE bookings SET status = 'CANCELLED', payment_status = 'CANCELLED', updated_at = NOW() WHERE id = ?`, [comp.id]);
          }
        }
      }
    }
  } catch (kickErr) {
    console.error('[RACE CONDITION] Error kicking competitor:', kickErr.message);
  }

  // 3. EMAIL/NOTIF CUSTOMER & AGENT (similar logic as old)
  try {
    const bookingData = await execute(
      `SELECT b.external_id, b.product_name, b.total_price, b.commission_rate, b.commission_amount, b.agent_earnings, b.user_name, b.user_id, u.email as user_email, b.date
       FROM bookings b LEFT JOIN users u ON b.user_id = u.id WHERE b.external_id = ? LIMIT 1`,
      [resultInvoiceNumber]
    );
    const bRows = Array.isArray(bookingData[0]) ? bookingData[0] : bookingData;
    if (bRows && bRows.length > 0) {
      const booking = bRows[0];
      const toEmail = booking.user_email || notification?.customer?.email || notification?.payer_email;
      if (toEmail) {
        await send_payment_success_email(toEmail, booking.user_name || 'Customer', booking.external_id, booking.product_name || 'Trivgoo Booking', booking.total_price);
      }
      if (booking.user_id) {
        await sendPushNotification(booking.user_id, 'Hore! Pembayaran Sukses 🎉', `Pembayaran untuk ${booking.product_name} senilai Rp ${Number(booking.total_price).toLocaleString('id-ID')} berhasil.`, { bookingId: String(booking.external_id), type: 'invoice_ready' });
      }
    }
    
    // Agent
    const agentData = await execute(
      `SELECT u.email AS agent_email, u.name AS agent_name, u.id AS agent_id, b.external_id, b.product_name, b.user_name, b.total_price, b.commission_rate, b.commission_amount, b.agent_earnings, b.quantity, b.date
       FROM bookings b JOIN products p ON b.product_id = p.id JOIN users u ON p.owner_id = u.id WHERE b.external_id = ? LIMIT 1`,
      [resultInvoiceNumber]
    );
    const aRows = Array.isArray(agentData[0]) ? agentData[0] : agentData;
    if (aRows && aRows.length > 0 && aRows[0].agent_email) {
      const agent = aRows[0];
      await send_new_booking_notification_email(agent.agent_email, agent.agent_name || 'Agent', agent);
      if (agent.agent_id) {
        await sendPushNotification(agent.agent_id, 'Booking Baru Dibayar! 💰', `${agent.user_name} berhasil membayar ${agent.quantity} pax tiket. Segera konfirmasi!`, { type: 'incoming_paid_booking', bookingId: String(agent.external_id) });
      }
    }
  } catch (emailErr) {
    console.error('[EMAIL NOTIF] Failed notifications:', emailErr.message);
  }
}

/**
 * POST /api/v1/payment/create-payment
 */
const createPayment = async (req, res) => {
  try {
    const user_id = req.session?.user?.id || req.body.user_id || null;
    let order = {};
    
    // Destructure new payload attributes along with legacy
    const { id, amount, name, email, product_name, quantity, product_id, date, start_time, end_time, gateway } = req.body;

    // Secure pricing is authoritative in the backend.
    let finalAmount = Number(amount);
    try {
      if (product_id) {
        const pricingEvaluation = await calculateFinalAmount({
          ...req.body,
          amount,
          product_id,
          quantity,
          user_id,
        });
        finalAmount = pricingEvaluation.final_amount;
        if (!pricingEvaluation.is_secure) {
          return misc.response(
            res,
            400,
            true,
            pricingEvaluation.reason || 'Integrity check failed: secure backend pricing requires more context'
          );
        }
      }
    } catch (e) {
      console.error('[PRICING ERROR] Could not validate price:', e.message);
      return misc.response(res, 400, true, 'Integrity check failed: Error calculating price');
    }

    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      return misc.response(res, 400, true, 'Amount tidak valid: ' + finalAmount);
    }

    // Determine Gateway
    const config = await config_resolver.getGatewayConfig(gateway); // falls back to DB default 'xendit' or 'doku'
    const providerModule = getGatewayModule(config.gateway);

    order = {
      id, amount: finalAmount, name, email, product_name, quantity, product_id, date,
      start_time: toMySQLDatetime(start_time),
      end_time: toMySQLDatetime(end_time),
    };

    // Race condition capacity lock
    if (order.product_id) {
      let bookingSumResult;
      if (order.start_time && order.end_time) {
        bookingSumResult = await query(
          `SELECT SUM(quantity) as total_booked FROM bookings WHERE product_id = ? AND start_time < ? AND end_time > ? AND status != 'CANCELLED' AND payment_status = 'PAID'`,
          [order.product_id, order.end_time, order.start_time]
        );
      } else {
        const orderDate = order.date || new Date().toISOString().split('T')[0];
        bookingSumResult = await query(
          `SELECT SUM(quantity) as total_booked FROM bookings WHERE product_id = ? AND date = ? AND status != 'CANCELLED' AND payment_status = 'PAID'`,
          [order.product_id, orderDate]
        );
      }

      const sumRows = Array.isArray(bookingSumResult[0]) ? bookingSumResult[0] : bookingSumResult;
      const totalBooked = sumRows && sumRows[0].total_booked ? Number(sumRows[0].total_booked) : 0;

      const prodResult = await execute('SELECT daily_capacity FROM products WHERE id = ? LIMIT 1', [order.product_id]);
      const prodRows = Array.isArray(prodResult[0]) ? prodResult[0] : prodResult;
      const actualCapacity = prodRows && prodRows.length > 0 && prodRows[0].daily_capacity != null ? Number(prodRows[0].daily_capacity) : 1;

      if (totalBooked >= actualCapacity) {
        return misc.response(res, 400, true, `Maaf, stok item ini baru saja habis dipesan.`);
      }
    }

    const transaction = await providerModule.createTransaction(order, config);
    const finalDate = order.date || new Date().toISOString().split('T')[0];
    const transIdentifier = transaction.gateway_invoice_id || transaction.request_id || null;

    // Extract booking metadata from req.body for persistence
    const bookingMeta = {
      pickup_location:  req.body.pickup_location  || req.body.pickupAddress  || null,
      dropoff_location: req.body.dropoff_location || req.body.dropoffAddress || null,
      with_driver:      req.body.withDriver ? 1 : 0,
      vehicle_type:     req.body.vehicle_type || null,
      duration:         Number(req.body.duration) || 1,
      pickup_fee:       Number(req.body.pickup_fee  || req.body.pickupFee  || 0),
      dropoff_fee:      Number(req.body.dropoff_fee || req.body.dropoffFee || 0),
      admin_fee:        Number(req.body.admin_fee || 0),
      add_ons_json:     JSON.stringify({
        withDriver:       Boolean(req.body.withDriver),
        premiumInsurance: Boolean(req.body.premiumInsurance),
        childSeat:        Boolean(req.body.childSeat),
      }),
    };

    // Secure insertions enforcing the actual selected gateway
    await execute(
      `INSERT INTO bookings 
        (external_id, user_id, product_id, user_name, product_name, quantity, total_price, date, start_time, end_time,
         pickup_location, dropoff_location, with_driver, vehicle_type, duration, pickup_fee, dropoff_fee, admin_fee, add_ons_json,
         status, payment_url, payment_gateway, payment_status, payment_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?,
               'PENDING', ?, ?, 'PENDING', ?, NOW())
       ON DUPLICATE KEY UPDATE
        payment_url        = VALUES(payment_url),
        payment_gateway    = VALUES(payment_gateway),
        payment_request_id = VALUES(payment_request_id),
        date               = VALUES(date),
        start_time         = VALUES(start_time),
        end_time           = VALUES(end_time),
        pickup_location    = VALUES(pickup_location),
        dropoff_location   = VALUES(dropoff_location),
        with_driver        = VALUES(with_driver),
        vehicle_type       = VALUES(vehicle_type),
        duration           = VALUES(duration),
        pickup_fee         = VALUES(pickup_fee),
        dropoff_fee        = VALUES(dropoff_fee),
        admin_fee          = VALUES(admin_fee),
        add_ons_json       = VALUES(add_ons_json),
        updated_at         = NOW()`,
      [
        order.id, user_id || null, order.product_id || null, order.name, order.product_name || '-',
        order.quantity || 1, order.amount, finalDate, order.start_time || null, order.end_time || null,
        bookingMeta.pickup_location, bookingMeta.dropoff_location, bookingMeta.with_driver,
        bookingMeta.vehicle_type, bookingMeta.duration, bookingMeta.pickup_fee, bookingMeta.dropoff_fee,
        bookingMeta.admin_fee, bookingMeta.add_ons_json,
        transaction.payment_url || null, config.gateway, transIdentifier
      ]
    );

    // Record the explicit transaction line strictly for the active gateway
    await execute(
      `INSERT INTO payment_transactions
        (booking_id, user_id, gateway, external_id, amount, currency, status, payment_url, gateway_invoice_id, gateway_response)
       SELECT id, ?, ?, ?, ?, 'IDR', 'PENDING', ?, ?, ?
       FROM bookings WHERE external_id = ? LIMIT 1
       ON DUPLICATE KEY UPDATE
        amount             = VALUES(amount),
        payment_url        = VALUES(payment_url),
        gateway_invoice_id = VALUES(gateway_invoice_id),
        gateway_response   = VALUES(gateway_response),
        updated_at         = NOW()`,
      [
        user_id || null, config.gateway, order.id, order.amount, transaction.payment_url || null, 
        transIdentifier, JSON.stringify(transaction), order.id,
      ]
    );

    return misc.response(res, 200, false, 'Payment created successfully', {
      payment_url: transaction.payment_url,
      invoice_number: transaction.invoice_number,
    });

  } catch (error) {
    console.error('[PAYMENT] createPayment error:', error.message);
    return misc.response(res, 500, true, error.message || 'Internal Server Error');
  }
};

const getPaymentStatus = async (req, res) => {
  try {
    const externalId = req.params.externalId || req.query.invoice || req.query.external_id;
    if (!externalId) {
      return misc.response(res, 400, true, 'External ID / invoice is required');
    }

    const bookingRows = await execute(
      `SELECT
         b.id,
         b.external_id,
         b.status,
         b.payment_status,
         b.payment_gateway,
         b.payment_url,
         b.payment_method,
         b.payment_expires_at,
         b.paid_at,
         b.total_price,
         b.product_name,
         b.updated_at
       FROM bookings b
       WHERE b.external_id = ?
       LIMIT 1`,
      [externalId]
    );
    const bookings = Array.isArray(bookingRows[0]) ? bookingRows[0] : bookingRows;

    if (!bookings || bookings.length === 0) {
      return misc.response(res, 404, true, `Booking ${externalId} not found`, null);
    }

    const booking = bookings[0];
    const transactionRows = await execute(
      `SELECT
         id,
         gateway,
         external_id,
         gateway_invoice_id,
         status,
         payment_url,
         payment_method,
         payment_channel,
         expires_at,
         paid_at,
         updated_at
       FROM payment_transactions
       WHERE external_id = ? AND gateway = ?
       ORDER BY id DESC
       LIMIT 1`,
      [externalId, booking.payment_gateway || 'xendit']
    );
    const transactions = Array.isArray(transactionRows[0]) ? transactionRows[0] : transactionRows;
    const latestTransaction = transactions && transactions.length > 0 ? transactions[0] : null;

    return misc.response(res, 200, false, 'Payment status fetched', {
      external_id: booking.external_id,
      booking_id: booking.id,
      booking_status: booking.status,
      payment_status: booking.payment_status,
      payment_gateway: booking.payment_gateway,
      payment_url: latestTransaction?.payment_url || booking.payment_url || null,
      payment_method: latestTransaction?.payment_method || booking.payment_method || null,
      payment_channel: latestTransaction?.payment_channel || null,
      payment_expires_at: latestTransaction?.expires_at || booking.payment_expires_at || null,
      paid_at: latestTransaction?.paid_at || booking.paid_at || null,
      total_price: booking.total_price,
      product_name: booking.product_name,
      updated_at: latestTransaction?.updated_at || booking.updated_at || null,
    });
  } catch (error) {
    console.error('[PAYMENT] getPaymentStatus error:', error.message);
    return misc.response(res, 500, true, error.message || 'Internal Server Error');
  }
};

/**
 * Universal safe webhook logic dispatcher
 */
const processWebhook = async (gatewayName, notification, headers, routingPath, res) => {
  try {
    const config = await config_resolver.getGatewayConfig(gatewayName);
    const provider = getGatewayModule(gatewayName);

    const verifyResp = gatewayName === 'doku'
      ? provider.verifyWebhook(notification, headers, config, routingPath || '/api/v1/payment/notification')
      : provider.verifyWebhook(notification, headers, config);

    if (!verifyResp.is_valid) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    const { transaction_status: rawStatus, invoice_number } = verifyResp;
    if (!invoice_number) throw new Error('Missing invoice ID in webhook payload');

    const newStatus = gatewayName === 'xendit' ? status_mapper.mapXenditStatus(rawStatus) : status_mapper.mapDokuStatus(rawStatus);
    const eventId = deriveWebhookEventId(gatewayName, notification, headers, rawStatus, invoice_number);
    const normalizedHeaders = normalizeHeaders(headers);

    if (eventId) {
      const duplicateRows = await execute(
        `SELECT id FROM webhook_logs WHERE gateway = ? AND transaction_id = ? LIMIT 1`,
        [gatewayName, eventId]
      );
      const duplicates = Array.isArray(duplicateRows[0]) ? duplicateRows[0] : duplicateRows;
      if (duplicates && duplicates.length > 0) {
        return res.json({ success: true, message: 'Duplicate webhook ignored' });
      }
    }

    // Initial persistence log
    await execute(
      `INSERT INTO webhook_logs (gateway, event_type, external_id, transaction_id, payload, headers, signature_verified, status) VALUES (?, ?, ?, ?, ?, ?, true, 'pending')`,
      [gatewayName, rawStatus, invoice_number, eventId, JSON.stringify(notification), JSON.stringify(normalizedHeaders)]
    );

    // Lock and inspect actual booking
    const bookingRows = await execute(`SELECT * FROM bookings WHERE external_id = ? LIMIT 1`, [invoice_number]);
    const currentBooking = Array.isArray(bookingRows[0]) ? bookingRows[0] : bookingRows;

    if (!currentBooking || currentBooking.length === 0) {
      await execute(
        `UPDATE webhook_logs
         SET status = 'failed', error_message = ?, processed_at = NOW()
         WHERE external_id = ? AND gateway = ?
         ORDER BY id DESC LIMIT 1`,
        [`Booking ${invoice_number} not found in database`, invoice_number, gatewayName]
      ).catch(() => {});
      return res.status(202).json({
        success: true,
        message: `Webhook received but booking ${invoice_number} was not found in database`,
      });
    }

    const booking = currentBooking[0];

    // Idempotency Catch
    if (booking.payment_status === 'PAID' && newStatus === 'PAID') {
      return res.json({ success: true, message: 'Already processed as PAID previously' });
    }

    // Cancellation Conflict Rule
    if (booking.status === 'CANCELLED' && newStatus === 'PAID') {
      console.warn(`[WEBHOOK CONFLICT] Refund needed. Booking ${invoice_number} already CANCELLED but user paid!`);
      await execute(`UPDATE webhook_logs SET status = 'needs_refund', error_message = 'Already cancelled' WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`, [invoice_number, gatewayName]);
      await execute(`UPDATE payment_transactions SET status = 'FAILED' WHERE external_id = ? AND gateway = ?`, [invoice_number, gatewayName]);
      return res.json({ success: true, message: 'Payment recorded but booking was cancelled. Needs manual refund.' });
    }

    // Happy Path Update
    const finalBookingStatus = mapPaymentStatusToBookingStatus(booking.status, newStatus);
    
    await execute(
      `UPDATE bookings SET status = ?, payment_status = ?, updated_at = NOW() WHERE external_id = ?`,
      [finalBookingStatus, newStatus, invoice_number]
    );

    await execute(
      `UPDATE payment_transactions SET status = ?, gateway_response = ?, paid_at = IF(? = 'PAID', NOW(), paid_at), updated_at = NOW() WHERE external_id = ? AND gateway = ?`,
      [newStatus, JSON.stringify(notification), newStatus, invoice_number, gatewayName]
    );

    await execute(
      `UPDATE webhook_logs SET status = 'processed', processed_at = NOW() WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`,
      [invoice_number, gatewayName]
    );

    if (newStatus === 'PAID') {
      await _onPaymentPaid(booking, invoice_number, notification);
    }

    return res.json({ success: true, message: 'Notification successfully processed' });

  } catch (err) {
    console.error(`[WEBHOOK ${gatewayName.toUpperCase()}] Error:`, err.message);
    const inv = notification?.external_id || notification?.order?.invoice_number;
    if (inv) {
      await execute(`UPDATE webhook_logs SET status = 'failed', error_message = ?, processed_at = NOW() WHERE external_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1`, [err.message, inv, gatewayName]).catch(()=>{});
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

const handleDokuWebhook = async (req, res) => {
  return processWebhook('doku', req.body, req.headers, req.originalUrl || '/api/v1/payment/notification', res);
};

const handleXenditWebhook = async (req, res) => {
  return processWebhook('xendit', req.body, req.headers, req.originalUrl || '/api/v1/payment/webhook/xendit', res);
};

module.exports = { createPayment, getPaymentStatus, handleDokuWebhook, handleXenditWebhook };
