
// Mock GitHubService or standalone fetch
const fetch = global.fetch;

async function testSampleService() {
  const baseUrl = 'https://api.github.com/repos/google/adk-samples/contents/python/agents';
  
  console.log('Fetching samples list...');
  const response = await fetch(baseUrl);
  if (!response.ok) {
    console.error('Failed to fetch samples:', response.statusText);
    return;
  }
  const data = await response.json();
  const samples = data.filter(item => item.type === 'dir').map(item => item.name);
  console.log('Found samples:', samples.length);
  if (samples.length > 0) {
    console.log('First sample:', samples[0]);
    
    // Test fetching files for the first sample
    const sampleName = samples[0];
    console.log(`Fetching files for ${sampleName}...`);
    
    async function fetchRecursive(url, basePath) {
        const res = await fetch(url);
        const items = await res.json();
        for (const item of items) {
            console.log(item.path);
            if (item.type === 'dir') {
                await fetchRecursive(item.url, item.path);
            }
        }
    }
    // Just list top level for now to avoid spamming API in test
    const filesRes = await fetch(`${baseUrl}/${sampleName}`);
    const files = await filesRes.json();
    console.log('Files in root:', files.map(f => f.name));
  }
}

testSampleService();
