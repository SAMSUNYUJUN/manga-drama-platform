const https = require('https');

const BASE_URL = 'https://api.qingyuntop.top';
const API_KEY = 'sk-XXCknLNDrvMzlP5xH8TdNktmi0ELONh5YFB5zix6omkzzoUi';

// 查询之前创建的任务
const TASK_ID = 'jimeng:68e5a25a-2105-4020-96fa-148b6fe5f76f';

async function httpRequest(method, url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
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
    req.end();
  });
}

async function queryTask() {
  console.log('Querying task:', TASK_ID);
  const res = await httpRequest('GET', `${BASE_URL}/v1/video/query?id=${TASK_ID}`);
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(res.data, null, 2));
  
  if (res.data?.video_url) {
    console.log('\n✅ Video URL:', res.data.video_url);
  }
}

queryTask();
