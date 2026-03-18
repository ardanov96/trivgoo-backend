const http = require('http');
const fs = require('fs');

const data = JSON.stringify({
  messages: [
    { role: 'bot', content: 'Halo! Saya asisten virtual AI Trivgoo. Ada yang bisa saya bantu untuk rencana perjalanan Anda hari ini?' },
    { role: "user", content: "apakah kamu bisa membantu saya" }
  ]
});

const req = http.request(
  {
    hostname: 'localhost',
    port: 4001,
    path: '/api/v1/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  },
  (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      fs.writeFileSync('raw_error.txt', responseData, 'utf-8');
      console.log('Error saved to raw_error.txt');
    });
  }
);

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
