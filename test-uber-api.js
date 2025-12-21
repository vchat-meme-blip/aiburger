// Test Uber API Direct Access
import https from 'https';

const clientId = 'ZS9LqHB0nw18_72Kt7JL-TK5KKt_cRR1';
const clientSecret = 'xr2J20IPnEmcc5z5YqWkeFjniin6dvJSqvno94Ks';

// Get client credentials token
const tokenData = new URLSearchParams({
  client_id: clientId,
  client_secret: clientSecret,
  grant_type: 'client_credentials',
  scope: 'eats.store eats.order'
});

const tokenBody = tokenData.toString();
const tokenOptions = {
  hostname: 'sandbox-login.uber.com',
  path: '/oauth/v2/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(tokenBody)
  }
};

console.log('Getting client credentials token...');

const tokenReq = https.request(tokenOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const tokenResponse = JSON.parse(data);
      console.log('Token received:', tokenResponse.access_token ? 'SUCCESS' : 'FAILED');

      if (tokenResponse.access_token) {
        // Try to get store details
        const storeOptions = {
          hostname: 'test-api.uber.com',
          path: '/v1/eats/stores/99348c94-533a-4032-a47b-20236f7c3ec2',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokenResponse.access_token}`,
            'Content-Type': 'application/json'
          }
        };

        console.log('Testing store access...');
        const storeReq = https.request(storeOptions, (storeRes) => {
          let storeData = '';
          storeRes.on('data', (chunk) => storeData += chunk);
          storeRes.on('end', () => {
            console.log(`Store API Status: ${storeRes.statusCode}`);
            console.log('Store Response:', storeData);
          });
        });

        storeReq.on('error', (e) => console.error('Store request error:', e));
        storeReq.end();
      }
    } catch (e) {
      console.error('Token parse error:', e);
      console.log('Raw response:', data);
    }
  });
});

tokenReq.on('error', (e) => console.error('Token request error:', e));
tokenReq.write(tokenBody);
tokenReq.end();
