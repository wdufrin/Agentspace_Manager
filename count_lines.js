/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
