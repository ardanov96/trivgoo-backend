require('dotenv').config();

const { Snap } = require('midtrans-client');

const snap = new Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

module.exports = snap;