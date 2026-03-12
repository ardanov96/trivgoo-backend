// Quick test: SNAP B2B Token after public key upload
require('dotenv').config({ path: '.env.development' });
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');

const clientId = process.env.DOKU_CLIENT_ID;
const baseUrl = process.env.DOKU_BASE_URL || 'https://api-sandbox.doku.com';
const privateKey = fs.readFileSync('doku_private_key.pem', 'utf8');

const now = new Date();
const offset = now.getTimezoneOffset();
const offsetHours = Math.abs(offset / 60);
const offsetMinutes = Math.abs(offset % 60);
const sign = offset >= 0 ? '-' : '+';
const pad = (num) => String(num).padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(offsetHours)}:${pad(offsetMinutes)}`;

const stringToSign = `${clientId}|${timestamp}`;
const rsaSig = crypto.createSign('RSA-SHA256');
rsaSig.update(stringToSign, 'utf8');
rsaSig.end();
const signature = rsaSig.sign(privateKey, 'base64');

console.log('Testing SNAP B2B Token...');
console.log('Client ID:', clientId);
console.log('Timestamp:', timestamp);

axios.post(baseUrl + '/authorization/v1/access-token/b2b', {
  grantType: 'client_credentials',
}, {
  headers: {
    'X-CLIENT-KEY': clientId,
    'X-TIMESTAMP': timestamp,
    'X-SIGNATURE': signature,
    'Content-Type': 'application/json',
  },
}).then(res => {
  console.log('\n=== SUCCESS! ===');
  console.log('Token:', JSON.stringify(res.data, null, 2));
}).catch(err => {
  console.log('\n=== FAILED ===');
  console.log('Status:', err.response?.status);
  console.log('Error:', JSON.stringify(err.response?.data, null, 2));
});
