
import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../services/apiService';

declare var JSZip: any;

interface AgentDeploymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    agentName: string;
    files: { name: string; content: string }[];
    projectNumber: string;
}

interface EnvVar {
    key: string;
    value: string;
    source: 'code' | '.env.example';
    description?: string;
    placeholder?: string;
}

const NodeIcon: React.FC<{ type: string }> = ({ type }) => {
    switch (type) {
        case 'agent': return <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-pink-400" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>;
        case 'tool': return <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>;
        default: return <div className="h-4 w-4 bg-gray-500 rounded-full"></div>;
    }
}

const AgentDeploymentModal: React.FC<AgentDeploymentModalProps> = ({ isOpen, onClose, agentName, files, projectNumber }) => {
    const [envVars, setEnvVars] = useState<EnvVar[]>([]);
    const [target, setTarget] = useState<'cloud_run' | 'reasoning_engine'>('reasoning_engine');
    const [region, setRegion] = useState('us-central1');
    const [tools, setTools] = useState<string[]>([]);
    const [readmeContent, setReadmeContent] = useState<string>('');
    const [leftTab, setLeftTab] = useState<'architecture' | 'docs'>('architecture');
    const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
    
    // Resolved Project ID
    const [projectId, setProjectId] = useState(projectNumber);
    const [isResolvingId, setIsResolvingId] = useState(false);
    
    // Detected agent entrypoint (variable name in python) and file
    const [entryPoint, setEntryPoint] = useState('app');
    const [entryModulePath, setEntryModulePath] = useState('agent'); // full dotted path, e.g. "academic_research.agent"

    // Deployment state
    const [isDeploying, setIsDeploying] = useState(false);
    const [buildId, setBuildId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        
        // Reset state
        setEnvVars([]);
        setTools([]);
        setBuildId(null);
        setError(null);
        setLogs([]);
        setIsDeploying(false);
        setProjectId(projectNumber); // Default to number
        setReadmeContent('');
        setLeftTab('architecture');
        setIsPermissionsExpanded(false);

        // 1. Resolve Project ID
        const resolveProject = async () => {
            setIsResolvingId(true);
            try {
                const p = await api.getProject(projectNumber);
                if (p.projectId) setProjectId(p.projectId);
            } catch (e) {
                console.warn("Could not resolve Project ID string");
            } finally {
                setIsResolvingId(false);
            }
        };
        resolveProject();

        // 2. Parse Files
        const readme = files.find(f => f.name.toLowerCase() === 'readme.md' || f.name.toLowerCase().endsWith('/readme.md'))?.content || '';
        const envExample = files.find(f => f.name === '.env.example' || f.name.endsWith('/.env.example'))?.content || '';
        const hasDockerfile = files.some(f => f.name === 'Dockerfile');

        // Set Readme
        setReadmeContent(readme);
        if (readme) setLeftTab('docs');

        // Determine Default Target
        if (hasDockerfile) {
            setTarget('cloud_run');
        } else {
            setTarget('reasoning_engine');
        }
        
        // Detect Main File and Entry Point (Recursive Search)
        let mainFileContent = '';
        let detectedFile = files.find(f => f.name === 'agent.py' || f.name.endsWith('/agent.py'));
        
        if (!detectedFile) {
            detectedFile = files.find(f => f.name === 'main.py' || f.name.endsWith('/main.py'));
        }

        if (!detectedFile) {
            detectedFile = files.find(f => f.name.endsWith('.py') && 
               (f.content.includes('AdkApp(') || f.content.includes('ReasoningEngine.create(') || f.content.includes('Agent(')));
        }

        if (detectedFile) {
            mainFileContent = detectedFile.content;
            
            // Construct module path (e.g. academic_research/agent.py -> academic_research.agent)
            const filePath = detectedFile.name;
            const pathParts = filePath.split('/');
            const fileName = pathParts.pop(); // agent.py
            const moduleName = fileName?.replace('.py', '') || 'agent';
            
            if (pathParts.length > 0) {
                // It's in a subdirectory
                setEntryModulePath(`${pathParts.join('.')}.${moduleName}`);
            } else {
                setEntryModulePath(moduleName);
            }
            
            // Detect Entry Point Variable
            // Look for patterns like: var = Class(...)
            const appMatch = mainFileContent.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z0-9_.]*Agent|[a-zA-Z0-9_.]*AdkApp|[a-zA-Z0-9_.]*ReasoningEngine)\(/m);
            if (appMatch && appMatch[1]) {
                setEntryPoint(appMatch[1]);
            } else if (mainFileContent.includes('agent =')) {
                setEntryPoint('agent');
            } else if (mainFileContent.includes('app =')) {
                setEntryPoint('app');
            } else {
                setEntryPoint('app'); // Default convention
            }
        } else {
            // Fallback
            setEntryModulePath('agent');
            setEntryPoint('app');
        }

        // Extract Tools (Naive Regex from python content)
        const detectedTools = new Set<string>();
        if (mainFileContent.includes('GoogleSearch')) detectedTools.add('Google Search');
        if (mainFileContent.includes('VertexAiSearchTool')) detectedTools.add('Vertex AI Search');
        if (mainFileContent.includes('LangchainTool')) detectedTools.add('Langchain Tool');
        
        const toolsMatch = mainFileContent.match(/tools\s*=\s*\[(.*?)\]/s);
        if (toolsMatch && toolsMatch[1]) {
            const rawTools = toolsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
            rawTools.forEach(t => {
                const cleanName = t.replace(/_tool$/, '').replace(/_/g, ' ');
                if (!detectedTools.has('Google Search') && !detectedTools.has('Vertex AI Search')) {
                     detectedTools.add(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
                }
            });
        }
        setTools(Array.from(detectedTools));

        // Extract Env Vars from .env.example
        const varsMap = new Map<string, EnvVar>();
        
        if (envExample) {
            const lines = envExample.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                // Supports KEY=value or KEY="value"
                const parts = trimmed.split('=');
                const key = parts[0].trim();
                const placeholder = parts.length > 1 ? parts.slice(1).join('=').trim().replace(/^"|"$/g, '') : '';
                
                varsMap.set(key, {
                    key,
                    value: '',
                    source: '.env.example',
                    placeholder: placeholder
                });
            }
        }

        // Extract Env Vars from code (fallback/addition)
        const regex = /os\.getenv\s*\(\s*["']([^"']+)["']/g;
        let match;
        while ((match = regex.exec(mainFileContent)) !== null) {
            const key = match[1];
            if (!varsMap.has(key)) {
                varsMap.set(key, {
                    key,
                    value: '',
                    source: 'code'
                });
            }
        }
        
        // Ensure standard vars are present
        const standardVars = ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'MODEL', 'GOOGLE_GENAI_USE_VERTEXAI'];
        standardVars.forEach(key => {
             if (!varsMap.has(key)) {
                let defaultValue = '';
                if (key === 'GOOGLE_GENAI_USE_VERTEXAI') defaultValue = 'TRUE';
                varsMap.set(key, { key, value: defaultValue, source: 'code', description: 'Standard GCP Env Var' });
             }
        });

        setEnvVars(Array.from(varsMap.values()));

    }, [isOpen, files, projectNumber]);

    // Update Env Vars when projectId or region changes
    useEffect(() => {
        setEnvVars(prev => prev.map(v => {
            if (v.key === 'GOOGLE_CLOUD_PROJECT') return { ...v, value: projectId };
            if (v.key === 'GOOGLE_CLOUD_LOCATION') return { ...v, value: region };
            if (v.key === 'MODEL') return { ...v, value: v.value || 'gemini-2.5-flash' };
            if (v.key === 'GOOGLE_GENAI_USE_VERTEXAI') return { ...v, value: v.value || 'TRUE' };
            return v;
        }));
    }, [projectId, region]);

    const handleVarChange = (index: number, value: string) => {
        const newVars = [...envVars];
        newVars[index].value = value;
        setEnvVars(newVars);
    };

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleDeploy = async () => {
        setIsDeploying(true);
        setError(null);
        addLog(`Starting deployment for ${agentName}...`);
        
        // Note: entryModulePath is like "subfolder.agent"
        // We convert dots back to slashes to check file existence "subfolder/agent.py"
        const expectedFilename = `${entryModulePath.replace(/\./g, '/')}.py`;
        const entryFileExists = files.some(f => f.name === expectedFilename);
        
        if (!entryFileExists) {
            const msg = `FATAL: The detected entry file '${expectedFilename}' (derived from '${entryModulePath}') was not found in the loaded files. Deployment cannot proceed.`;
            addLog(msg);
            setError(msg);
            setIsDeploying(false);
            return;
        }

        addLog(`Detected Entry Point: '${entryModulePath}.${entryPoint}'`);

        try {
            // 2. Create Zip
            const zip = new JSZip();
            addLog("Files to be zipped:");
            files.forEach(f => {
                zip.file(f.name, f.content);
                addLog(` - ${f.name} (${f.content.length} chars)`);
            });
            
            // Add requirements if missing (basic fallback)
            // Ensure google-cloud-aiplatform[adk,agent_engines]>=1.38 is present for Reasoning Engine
            const reqsFile = files.find(f => f.name === 'requirements.txt');
            let reqsContent = reqsFile ? reqsFile.content : '';
            if (!reqsContent.includes('google-cloud-aiplatform')) {
                reqsContent += '\ngoogle-cloud-aiplatform[adk,agent_engines]>=1.38\nflask\ngunicorn\npython-dotenv';
                zip.file('requirements.txt', reqsContent);
                addLog('⚠️ Updated requirements.txt with ADK/Agent Engines support');
            } else if (!reqsFile) {
                zip.file('requirements.txt', 'google-cloud-aiplatform[adk,agent_engines]>=1.38\nflask\ngunicorn\npython-dotenv');
                addLog('⚠️ Added default requirements.txt with ADK support');
            } else {
                // If present but maybe missing extras, we append them just in case or rely on the build step to force install
                zip.file('requirements.txt', reqsContent); 
            }

            // Generate content based on target
            if (target === 'cloud_run') {
                // Check/Add Dockerfile
                if (!files.some(f => f.name === 'Dockerfile')) {
                    zip.file('Dockerfile', `
FROM python:3.10-slim
WORKDIR /app
# Install build dependencies for libraries that require compilation (e.g. pyarrow, numpy)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake && rm -rf /var/lib/apt/lists/*
COPY . .
# Upgrade pip to ensure latest wheel support
RUN pip install --upgrade pip
# Force ADK install here to ensure google.adk namespace is available
RUN pip install --no-cache-dir -r requirements.txt && pip install "google-cloud-aiplatform[adk,agent_engines]>=1.38"
CMD ["python", "main.py"]
`); 
                    // Add Cloud Run Adapter (main.py)
                    if (!files.some(f => f.name === 'main.py')) {
                         zip.file('main.py', `
import os
import sys
import json
from flask import Flask, request, jsonify, Response, stream_with_context

# Try to import AdkApp wrapper for compatibility
AdkApp = None
try:
    from vertexai.agent_engines import AdkApp
except ImportError:
    try:
        from vertexai.preview.reasoning_engines import AdkApp
    except ImportError:
        try:
            from google.cloud.aiplatform.reasoning_engines import AdkApp
        except ImportError:
            pass

# Add current directory to path
sys.path.append(os.getcwd())

# Import the detected agent/app object
try:
    from ${entryModulePath} import ${entryPoint} as agent_app
except ImportError as e:
    print(f"FATAL: Could not import '${entryPoint}' from '${entryModulePath}'. Error: {e}")
    # Fallback to root import if subfolder import fails
    try:
        from ${entryModulePath.split('.').pop()} import ${entryPoint} as agent_app
    except:
        raise e

# --- AUTO-WRAP LOGIC ---
# If the imported object doesn't have 'query' or 'invoke', it's likely a raw Agent (like LlmAgent).
# We wrap it in AdkApp to provide a standard query interface.
if not hasattr(agent_app, 'query') and not hasattr(agent_app, 'invoke'):
    print(f"Object type {type(agent_app)} missing query/invoke methods. Attempting to wrap in AdkApp...")
    if AdkApp:
        try:
            agent_app = AdkApp(agent=agent_app)
            print("✅ Successfully wrapped agent in AdkApp.")
        except Exception as e:
            print(f"❌ Failed to wrap agent in AdkApp: {e}")
    else:
        print("⚠️ AdkApp class not found. Cannot auto-wrap agent. Requests might fail.")

app = Flask(__name__)

# --- CORS Configuration ---
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

@app.route('/', methods=['POST', 'OPTIONS'])
def invoke_simple():
    """
    Simple adapter to query the agent. 
    Accepts: { "prompt": "..." } or { "text": "..." }
    """
    # Explicitly handle CORS preflight requests
    if request.method == "OPTIONS":
        return "", 204

    try:
        data = request.json
        user_input = data.get('prompt') or data.get('text') or data.get('query') or data.get('message')
        
        if not user_input:
            return jsonify({"error": "Missing input. Provide 'prompt', 'text', or 'query'."}), 400

        # Query the agent
        if hasattr(agent_app, 'query'):
            response = agent_app.query(payload=user_input)
        elif hasattr(agent_app, 'invoke'):
            response = agent_app.invoke(user_input)
        else:
            response = f"Agent loaded, but query method not found on object type: {type(agent_app)}"

        return jsonify({"response": str(response)})
        
    except Exception as e:
        print(f"Error invoking agent: {e}")
        return jsonify({"error": str(e)}), 500

# --- ADK Compatible Endpoints ---

@app.route('/list-apps', methods=['GET'])
def list_apps():
    """Lists available apps (agents). Matches ADK API contract."""
    # Assuming the current agent is the default/only app
    return jsonify(["${agentName}"])

@app.route('/apps/<app_name>/users/<user_id>/sessions/<session_id>', methods=['POST', 'OPTIONS'])
def update_session(app_name, user_id, session_id):
    """
    Initializes or updates session state. 
    For this stateless Cloud Run implementation, this acts as a no-op acknowledgement.
    """
    if request.method == "OPTIONS":
        return "", 204
    
    print(f"Session init request for app={app_name}, user={user_id}, session={session_id}")
    return jsonify({"status": "ok", "message": "Session context received (stateless)"})

@app.route('/run_sse', methods=['POST', 'OPTIONS'])
def run_sse():
    """
    Standard ADK endpoint for running the agent.
    Supports both streaming=true (SSE) and streaming=false (JSON).
    """
    if request.method == "OPTIONS":
        return "", 204

    try:
        data = request.get_json()
        # ADK Payload: { app_name, user_id, session_id, new_message: { parts: [{text: "..."}] }, streaming: bool }
        
        new_message = data.get('new_message', {})
        parts = new_message.get('parts', [])
        user_text = parts[0].get('text', '') if parts else ''
        streaming = data.get('streaming', False)

        if not user_text:
             return jsonify({"error": "No text provided in new_message.parts"}), 400

        print(f"Run SSE request: text='{user_text}', streaming={streaming}")

        # Execute Agent Logic
        response_text = ""
        if hasattr(agent_app, 'query'):
            # TODO: If query() supports streaming iterator, use it. For now, we assume blocking.
            response_text = str(agent_app.query(payload=user_text))
        elif hasattr(agent_app, 'invoke'):
            response_text = str(agent_app.invoke(user_text))
        else:
            response_text = "Error: Agent does not support query() or invoke()"

        # If streaming is requested, simulate SSE format or return JSON
        if streaming:
            # Simple SSE simulation for compatibility
            def generate():
                # ADK often expects specific event types like 'chunk' or 'complete'
                # We will send a simple 'message' event with the full text for now
                yield f"data: {json.dumps({'text': response_text})}\\n\\n"
                yield "event: complete\\ndata: {}\\n\\n"
            return Response(stream_with_context(generate()), mimetype='text/event-stream')
        else:
            # Standard JSON response
            return jsonify({
                "text": response_text,
                "finished": True
            })

    except Exception as e:
        print(f"Error in /run_sse: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
`);
                        addLog(`⚠️ Added Flask wrapper (main.py) with ADK-compatible endpoints (/run_sse, /list-apps) adapting '${entryPoint}' from '${entryModulePath}'.`);
                    }
                }
            } else {
                // Reasoning Engine Target
                // Updated deployment script to align with standard deployment guide using vertexai.agent_engines
                const deployScript = `
import os
import sys
import logging
import vertexai

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 1. Initialize Vertex AI
project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION")
staging_bucket = os.getenv("STAGING_BUCKET")

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)

# 2. Import the Agent Code
sys.path.append(os.getcwd())
target_module = "${entryModulePath}"
target_object = "${entryPoint}"

logger.info(f"Importing agent '{target_object}' from '{target_module}'...")
try:
    module = __import__(target_module, fromlist=[target_object])
    root_agent = getattr(module, target_object)
    logger.info("Agent imported successfully.")
except Exception as e:
    logger.error(f"Failed to import agent: {e}")
    raise

# 3. Prepare for Deployment (AdkApp Wrapper)
try:
    # Try using the primary namespace
    from vertexai import agent_engines
    logger.info("Using 'vertexai.agent_engines'")
    
    # Check if already wrapped or has register_operations
    if hasattr(root_agent, 'register_operations'):
        logger.info("Object appears to be a valid Agent Engine app. Skipping AdkApp wrap.")
        app = root_agent
    else:
        logger.info("Wrapping agent in AdkApp...")
        app = agent_engines.AdkApp(agent=root_agent, enable_tracing=True)

    # 4. Deploy
    logger.info("Creating Agent Engine (Remote App)...")
    
    reqs = ["google-cloud-aiplatform[adk,agent_engines]>=1.38", "python-dotenv"]
    
    remote_app = agent_engines.create(
        agent_engine=app,
        requirements=reqs,
        display_name="${agentName}"
    )

except ImportError:
    # Fallback to Preview namespace if agent_engines not found (older SDKs)
    logger.warning("'vertexai.agent_engines' not found. Falling back to 'vertexai.preview.reasoning_engines'.")
    from vertexai.preview import reasoning_engines
    
    if hasattr(root_agent, 'register_operations'):
        app = root_agent
    else:
        logger.info("Wrapping agent in reasoning_engines.AdkApp...")
        app = reasoning_engines.AdkApp(agent=root_agent)

    reqs = ["google-cloud-aiplatform[adk]>=1.38", "python-dotenv"]
    remote_app = reasoning_engines.ReasoningEngine.create(
        app,
        requirements=reqs,
        display_name="${agentName}",
    )

print(f"Deployment finished!")
print(f"Resource Name: {remote_app.resource_name}")
`;
                zip.file('deploy_re.py', deployScript);
                addLog('Generated deploy_re.py for Reasoning Engine deployment.');
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            
            // 3. Upload Source to GCS
            const bucketsResp = await api.listBuckets(projectId);
            const bucket = bucketsResp.items?.[0]?.name;
            if (!bucket) throw new Error("No GCS buckets found in project. Please create one for staging.");
            
            const sourceObjectName = `source/${agentName}-${Date.now()}.zip`;
            addLog(`Uploading source to gs://${bucket}/${sourceObjectName}...`);
            addLog(`File size: ${(blob.size / 1024).toFixed(2)} KB`);
            
            const file = new File([blob], "source.zip", { type: "application/zip" });
            await api.uploadFileToGcs(bucket, sourceObjectName, file, projectId);
            
            // 4. Construct Cloud Build Config
            const buildConfig: any = {
                source: {
                    storageSource: {
                        bucket: bucket,
                        object: sourceObjectName
                    }
                },
                steps: [],
                timeout: "600s"
            };

            const envStrings = envVars.map(e => `${e.key}=${e.value}`);
            envStrings.push(`STAGING_BUCKET=gs://${bucket}`);

            if (target === 'cloud_run') {
                const imageName = `gcr.io/${projectId}/${agentName.toLowerCase()}`;
                addLog(`Target Image: ${imageName}`);
                
                // Build Image using Docker
                buildConfig.steps.push({
                    name: 'gcr.io/cloud-builders/docker',
                    args: ['build', '-t', imageName, '.']
                });

                // Push Image
                buildConfig.steps.push({
                    name: 'gcr.io/cloud-builders/docker',
                    args: ['push', imageName]
                });
                
                // Deploy Image
                buildConfig.steps.push({
                    name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                    entrypoint: 'gcloud',
                    args: ['run', 'deploy', agentName.toLowerCase(), '--image', imageName, '--region', region, '--allow-unauthenticated', '--set-env-vars', envStrings.join(',')]
                });
            } else {
                // Reasoning Engine
                // Ensure dependencies are installed before running deployment script
                buildConfig.steps.push({
                    name: 'python:3.10',
                    entrypoint: 'bash',
                    // Note: Use force install for [adk,agent_engines] to ensure extras are picked up
                    args: ['-c', 'pip install --upgrade pip && pip install -r requirements.txt && pip install "google-cloud-aiplatform[adk,agent_engines]>=1.38" && python deploy_re.py'],
                    env: envStrings
                });
            }

            // 5. Trigger Build
            addLog('Triggering Cloud Build...');
            const buildOp = await api.createCloudBuild(projectId, buildConfig);
            setBuildId(buildOp.metadata?.build?.id || 'unknown');
            addLog(`Build triggered! ID: ${buildOp.metadata?.build?.id}`);
            addLog(`Check Cloud Build console for detailed logs.`);

        } catch (err: any) {
            setError(err.message || 'Deployment failed');
            addLog(`Error: ${err.message}`);
        } finally {
            setIsDeploying(false);
        }
    };

    const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
    const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"`;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-gray-700">
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-teal-400">Deploy Agent:</span> {agentName}
                    </h2>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-full">{files.length} Files Loaded</span>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Pane: Architecture & Docs */}
                    <div className="w-1/3 bg-gray-800/50 flex flex-col border-r border-gray-700">
                        <div className="flex border-b border-gray-700">
                            <button 
                                onClick={() => setLeftTab('docs')} 
                                className={`flex-1 py-3 text-sm font-medium ${leftTab === 'docs' ? 'text-white border-b-2 border-blue-500 bg-gray-700/50' : 'text-gray-400 hover:text-white'}`}
                            >
                                Documentation
                            </button>
                            <button 
                                onClick={() => setLeftTab('architecture')} 
                                className={`flex-1 py-3 text-sm font-medium ${leftTab === 'architecture' ? 'text-white border-b-2 border-blue-500 bg-gray-700/50' : 'text-gray-400 hover:text-white'}`}
                            >
                                Architecture
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {leftTab === 'docs' ? (
                                readmeContent ? (
                                    <div className="prose prose-invert prose-sm max-w-none">
                                        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300">
                                            {readmeContent}
                                        </pre>
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-500 mt-10">
                                        <p>No README.md found in this agent package.</p>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center space-y-6">
                                    {/* Agent Node */}
                                    <div className="flex flex-col items-center">
                                        <div className="w-20 h-20 bg-pink-900/50 border-2 border-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-pink-900/20">
                                            <NodeIcon type="agent" />
                                        </div>
                                        <span className="mt-2 text-white font-medium text-sm">Agent</span>
                                        <span className="text-xs text-gray-500 font-mono mt-1">entry: {entryModulePath}.{entryPoint}</span>
                                    </div>

                                    {/* Connector */}
                                    {tools.length > 0 && <div className="h-8 w-0.5 bg-gray-600"></div>}

                                    {/* Tools Grid */}
                                    {tools.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-3 w-full">
                                            {tools.map((tool, i) => (
                                                <div key={i} className="flex items-center p-3 bg-gray-700/30 border border-teal-500/30 rounded-lg">
                                                    <NodeIcon type="tool" />
                                                    <span className="ml-3 text-gray-300 text-xs font-medium">{tool}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500 italic mt-4">No external tools detected via static analysis.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Pane: Configuration Form */}
                    <div className="flex-1 p-6 overflow-y-auto bg-gray-800">
                        <div className="space-y-6 max-w-2xl mx-auto">
                            
                            {/* Project Info */}
                            <div className="bg-blue-900/20 border border-blue-800 p-3 rounded-md flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-blue-300 uppercase font-semibold">Target Project ID</p>
                                    <p className="text-sm text-white font-mono">{projectId}</p>
                                </div>
                                {isResolvingId && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>}
                            </div>

                            {/* Deployment Target */}
                            <div>
                                <h3 className="text-lg font-medium text-white mb-3">1. Deployment Target</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <label className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${target === 'cloud_run' ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'}`}>
                                        <input type="radio" name="target" value="cloud_run" checked={target === 'cloud_run'} onChange={() => setTarget('cloud_run')} className="hidden" />
                                        <div className="font-bold text-white mb-1">Cloud Run</div>
                                        <div className="text-xs text-gray-400">Deploy as a scalable HTTP service.</div>
                                    </label>
                                    <label className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${target === 'reasoning_engine' ? 'border-red-500 bg-red-900/20' : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'}`}>
                                        <input type="radio" name="target" value="reasoning_engine" checked={target === 'reasoning_engine'} onChange={() => setTarget('reasoning_engine')} className="hidden" />
                                        <div className="font-bold text-white mb-1">Reasoning Engine</div>
                                        <div className="text-xs text-gray-400">Deploy to Vertex AI runtime.</div>
                                    </label>
                                </div>
                            </div>

                            {/* Location */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Region</label>
                                <select 
                                    value={region} 
                                    onChange={(e) => setRegion(e.target.value)} 
                                    className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
                                >
                                    <option value="us-central1">us-central1</option>
                                    <option value="europe-west1">europe-west1</option>
                                    <option value="asia-east1">asia-east1</option>
                                </select>
                            </div>

                            {/* Env Variables */}
                            <div>
                                <h3 className="text-lg font-medium text-white mb-3 flex items-center">
                                    2. Configuration Variables
                                    <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                                        Parsed from .env.example & {entryModulePath}.py
                                    </span>
                                </h3>
                                <div className="space-y-3">
                                    {envVars.map((v, i) => (
                                        <div key={i}>
                                            <label className="block text-xs font-medium text-gray-400 mb-1 flex justify-between">
                                                <span>{v.key}</span>
                                                <span className="flex items-center gap-2">
                                                    {v.source === '.env.example' && <span className="text-[10px] bg-green-900 text-green-200 px-1.5 rounded">.env</span>}
                                                    {v.source === 'code' && <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 rounded">code</span>}
                                                </span>
                                            </label>
                                            <input 
                                                type="text" 
                                                value={v.value} 
                                                onChange={(e) => handleVarChange(i, e.target.value)}
                                                className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-teal-500 font-mono placeholder-gray-500"
                                                placeholder={v.placeholder || v.description}
                                            />
                                        </div>
                                    ))}
                                    {envVars.length === 0 && <p className="text-sm text-gray-500 italic">No environment variables detected in code.</p>}
                                </div>
                            </div>

                            {/* Entry Point Config */}
                            <div className="bg-gray-700/30 p-3 rounded-md border border-gray-600">
                                <h3 className="text-lg font-medium text-white mb-3">3. Entry Point Configuration</h3>
                                <p className="text-xs text-gray-400 mb-3">
                                    Modify these values if the auto-detection failed or if you are getting "ImportError" during deployment.
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">Entry Module Path</label>
                                        <input 
                                            type="text" 
                                            value={entryModulePath} 
                                            onChange={(e) => setEntryModulePath(e.target.value)}
                                            className="w-full bg-gray-700 border-gray-500 rounded-md px-2 py-1.5 text-xs text-white font-mono"
                                            placeholder="e.g. academic_research.agent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1">Entry Object Name</label>
                                        <input 
                                            type="text" 
                                            value={entryPoint} 
                                            onChange={(e) => setEntryPoint(e.target.value)}
                                            className="w-full bg-gray-700 border-gray-500 rounded-md px-2 py-1.5 text-xs text-white font-mono"
                                            placeholder="e.g. agent"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Logs & Errors */}
                            {(logs.length > 0 || error) && (
                                <div className="bg-black rounded-lg p-3 border border-gray-700 font-mono text-xs max-h-40 overflow-y-auto">
                                    {error && <div className="text-red-400 mb-1">Error: {error}</div>}
                                    {logs.map((log, i) => <div key={i} className="text-gray-300">{log}</div>)}
                                    {buildId && <div className="text-green-400 mt-2">Build ID: {buildId}</div>}
                                </div>
                            )}

                            {/* Cloud Build Permissions Warning */}
                            {target === 'cloud_run' && (
                                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md mb-4">
                                    <button 
                                        onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                                        className="flex items-center justify-between w-full text-left"
                                    >
                                        <span className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            Cloud Build Permissions Required
                                        </span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-yellow-200 transition-transform ${isPermissionsExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                    </button>
                                    {isPermissionsExpanded && (
                                        <div className="mt-3">
                                            <p className="text-xs text-yellow-100 mb-2">
                                                Cloud Build needs <strong>Cloud Run Admin</strong> and <strong>Service Account User</strong> roles to deploy this service. Run this once in your terminal:
                                            </p>
                                            <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
                                                 <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
                                                    {grantPermissionsCommand}
                                                </pre>
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(grantPermissionsCommand)}
                                                    className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Action Button */}
                            <div className="pt-4">
                                <button
                                    onClick={handleDeploy}
                                    disabled={isDeploying}
                                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg transform transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                                >
                                    {isDeploying ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                            Deploying via Cloud Build...
                                        </>
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                                            Launch Build & Deploy
                                        </>
                                    )}
                                </button>
                                <p className="text-center text-xs text-gray-500 mt-2">
                                    Triggers a Google Cloud Build job in your project to package and deploy this agent.
                                </p>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentDeploymentModal;
