const https = require('https');
const http = require('http');

const BASE_URL = 'https://api.qingyuntop.top';
const API_KEY = 'sk-XXCknLNDrvMzlP5xH8TdNktmi0ELONh5YFB5zix6omkzzoUi';

async function httpRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => reject(new Error('Request timeout')));
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testJimengVideo() {
  console.log('=== Testing Jimeng Video API ===\n');

  // Step 1: Create video task
  console.log('1. Creating video task...');
  const createPayload = {
    model: 'jimeng-video-3.0',
    prompt: 'A cute cat playing with a ball',
    aspect_ratio: '16:9',
    size: '1080P',
    images: [],
  };
  console.log('   Payload:', JSON.stringify(createPayload));

  try {
    const createRes = await httpRequest('POST', `${BASE_URL}/v1/video/create`, createPayload);
    console.log('   Response status:', createRes.status);
    console.log('   Response data:', JSON.stringify(createRes.data, null, 2));

    if (createRes.status !== 200 || !createRes.data?.id) {
      console.log('\n❌ Failed to create video task');
      return;
    }

    const taskId = createRes.data.id;
    console.log(`\n✅ Task created: ${taskId}`);

    // Step 2: Query task status
    console.log('\n2. Querying task status...');
    const queryRes = await httpRequest('GET', `${BASE_URL}/v1/video/query?id=${taskId}`);
    console.log('   Response status:', queryRes.status);
    console.log('   Response data:', JSON.stringify(queryRes.data, null, 2));

    console.log('\n✅ Query successful!');
    console.log('   Status:', queryRes.data?.status);
    console.log('   Progress:', queryRes.data?.progress);
    
    if (queryRes.data?.video_url) {
      console.log('   Video URL:', queryRes.data.video_url);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testJimengVideo();
