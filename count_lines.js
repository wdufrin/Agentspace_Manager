const fs = require('fs');
const content = fs.readFileSync('pages/AgentBuilderPage.tsx', 'utf8');
const search = 'const generateAdkDeployScript = (config: AdkAgentConfig): string => {';
const start = content.indexOf(search);
const stringStart = content.indexOf('`\n', start) + 2;
const stringEnd = content.indexOf('\n`.trim();', stringStart);
const script = content.substring(stringStart, stringEnd);
const lines = script.split('\n');
lines.forEach((l, i) => {
    if (l.includes('agent_engines.create(')) {
        console.log(`agent_engines.create is at line ${i + 1}`);
    }
});
