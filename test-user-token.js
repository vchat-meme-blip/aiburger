// Get user token and test store access
import https from 'https';

// Get user token from database (simulate)
console.log('Testing user OAuth token for store access...');

// Use your user ID to get token from the app's database
const userId = 'c31ba0dc9389a994ced0ecec9837f611';

// Try to call the app's store endpoint directly
const storeOptions = {
  hostname: 'func-burger-api-lf6kch3t2wm3e.azurewebsites.net',
  path: `/api/uber/stores/99348c94-533a-4032-a47b-20236f7c3ec2?userId=${userId}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log('Testing store endpoint with user token...');
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
