
const misc = require('../helpers/response');
const payment_service = require('../services/payment_service');

const createPayment = async (req, res) => {
    try {
        const { id, amount, name, email } = req.body;
        if (!amount || !id || !name || !email) {
            return misc.response(res, 400, false, 'Bad Request', 'Missing required fields');
        }

        const transaction = await payment_service.createTransaction({
            id,
            amount,
            name,
            email,
        });

        return misc.response(res, 200, true, 'Payment URL created successfully', transaction);
    } catch (error) {
        console.error('Error creating payment:', error);
        return misc.response(res, 500, false, 'Internal Server Error', error.message);
    }
};

const handleNotification = async (req, res) => {
    try {
        const notification = req.body;
        await payment_service.handleNotification(notification);
        res.json({ success: true, message: 'Notification processed successfully' });
    } catch (error) {
        console.error('Error handling notification:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createPayment,
    handleNotification,
};
