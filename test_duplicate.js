require('dotenv').config({ path: '.env.development' });
const { createTransaction } = require('./src/services/payment_service');

async function testDuplicate() {
    try {
        console.log("Testing duplicate ORD-1001...");
        const result = await createTransaction({
            id: 'ORD-1001',
            amount: 75000,
            name: 'Budi Postman',
            email: 'budi.postman@example.com',
            product_name: 'Sewa Trip Bali',
            quantity: 1
        });
        console.log('\n=== SUCCESS ===');
        console.log(result);
    } catch (err) {
        console.error('\n=== ERROR ===');
        console.error(err.message);
    }
}

testDuplicate();
