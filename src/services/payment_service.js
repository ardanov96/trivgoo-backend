const snap = require('../configs/midtrans');
const crypto = require('crypto');


const createTransaction = async (order) => {
    const parameter = {
        transaction_details: {
            order_id: order.id,
            gross_amount: order.amount,
        },
        customer_details: {
            first_name: order.name,
            email: order.email,
        },
    };

    return await snap.createTransaction(parameter);
};

const handleNotification = async (notification) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = notification;

    const hash = crypto.createHash('sha512').update(order_id + status_code + gross_amount + serverKey).digest('hex');

    if (hash !== signature_key) {
        throw new Error('Invalid signature');
    }

    if (transaction_status === 'settlement') {
        // Update status order di database
    }
};

module.exports = {
    createTransaction,
    handleNotification,
};  