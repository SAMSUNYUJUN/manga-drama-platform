const https = require('https');
// API settings should be configured via admin UI at /admin/providers
const BASE_URL = process.env.JIMENG_BASE_URL || 'https://api.qingyuntop.top';
const API_KEY = process.env.JIMENG_API_KEY || '';
const TASK_ID = 'jimeng:f3471c69-f151-49e4-95b2-678654660b3b';

const req = https.request({
  hostname: 'api.qingyuntop.top',
  port: 443,
  path: '/v1/video/query?id=' + TASK_ID,
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + API_KEY }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(JSON.stringify(JSON.parse(body), null, 2)));
});
req.end();
