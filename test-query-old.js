const https = require('https');
const BASE_URL = 'https://api.qingyuntop.top';
const API_KEY = 'sk-XXCknLNDrvMzlP5xH8TdNktmi0ELONh5YFB5zix6omkzzoUi';
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
