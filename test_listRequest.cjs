const fetch = require('node-fetch');

async function listMcpTools(projectId, mcpEndpointUrl, token) {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  };

  const response = await fetch(mcpEndpointUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': projectId
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log("Raw Data:", JSON.stringify(data, null, 2));

  if (data.result && data.result.tools) {
    return data.result.tools;
  }
  return [];
}

async function main() {
  const token = "$(gcloud auth print-access-token)";
  const projectId = "$(gcloud config get-value project)";
  console.log("Testing BQ...");
  const bqTools = await listMcpTools(projectId, 'https://bigquery.googleapis.com/mcp', token);
  console.log("Tools returned:", bqTools.length);
}

main().catch(console.error);
