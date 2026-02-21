const { google } = require('googleapis');
const fetch = require('node-fetch');

async function testBqMcp() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const projectId = await auth.getProjectId();
  
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  
  const res = await fetch('https://bigquery.googleapis.com/mcp', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': projectId
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testBqMcp().catch(console.error);
