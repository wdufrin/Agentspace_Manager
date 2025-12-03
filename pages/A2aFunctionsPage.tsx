
import React, { useState, useEffect } from 'react';
import ProjectInput from '../components/ProjectInput';
import { CloudRunService } from '../types';
import * as api from '../services/apiService';

declare var JSZip: any;

interface A2aFunctionsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: any;
}

interface FunctionConfig {
    serviceName: string;
    displayName: string;
    providerOrganization: string;
    model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
    region: string;
    memory: string;
    instruction: string;
    allowUnauthenticated: boolean;
}

// --- Code Generation Logic ---

const generateMainPy = (instruction: string): string => `
import os
from flask import Flask, request, jsonify
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json

# Initialization
app = Flask(__name__)

# --- CORS Configuration ---
# This allows the web-based A2A Tester to query this function.
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# Load configuration from environment variables
MODEL_NAME = os.getenv("MODEL", "gemini-2.5-flash")
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION")

# Agent card details from environment
AGENT_URL = os.getenv("AGENT_URL", "URL_NOT_SET")
AGENT_DISPLAY_NAME = os.getenv("AGENT_DISPLAY_NAME", "A2A Function")
AGENT_DESCRIPTION = os.getenv("AGENT_DESCRIPTION", "An agent-to-agent function.")
PROVIDER_ORGANIZATION = os.getenv("PROVIDER_ORGANIZATION", "Unknown")

# This is the DEFAULT instruction if none is provided in the request
DEFAULT_SYSTEM_INSTRUCTION = """
${instruction}
"""

# Initialize Vertex AI SDK
try:
    if PROJECT_ID and LOCATION:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
except Exception as e:
    print(f"Warning: Could not initialize Vertex AI SDK: {e}")

# Initialize the Vertex AI Gemini model
try:
    model = GenerativeModel(MODEL_NAME)
    print(f"GenerativeModel '{MODEL_NAME}' initialized.")
except Exception as e:
    print(f"FATAL: Could not initialize GenerativeModel. Error: {e}")
    model = None


@app.route("/", methods=["GET", "OPTIONS"])
def health_check():
    """Health check endpoint."""
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"status": "ok"}), 200

@app.route("/.well-known/agent.json", methods=["GET", "OPTIONS"])
def get_agent_card():
    """Serves the agent's discovery card (agent.json)."""
    # Explicitly handle CORS preflight requests
    if request.method == "OPTIONS":
        return "", 204

    card = {
        "name": AGENT_DISPLAY_NAME,
        "description": AGENT_DESCRIPTION,
        # IMPORTANT: The URL must point to the endpoint that handles POST requests.
        # We append /invoke to the base URL to match the route defined below.
        "url": f"{AGENT_URL.rstrip('/')}/invoke",
        "capabilities": {
            # The invoke endpoint is not streaming, so set to false.
            "streaming": False
        },
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "preferredTransport": "JSONRPC",
        "protocolVersion": "0.3.0",
        "skills": [{
            "description": "Chat with the agent.",
            "examples": ["Hello, world!"],"id": "chat",
            "name": "Chat Skill",
            "tags": ["chat"]
        }],
        "version": "1.0.0"
    }
    return jsonify(card)


@app.route("/invoke", methods=["POST", "OPTIONS"])
def invoke():
    """
    Main endpoint to invoke the agent-to-agent function.
    Expects a JSON-RPC 2.0 payload with standard A2A message structure.
    """
    # Explicitly handle CORS preflight requests
    if request.method == "OPTIONS":
        return "", 204

    if not model:
        return jsonify({"error": "Model not initialized"}), 500
        
    # Cloud Run's IAM integration handles the actual token validation.
    if "Authorization" not in request.headers:
        # We log a warning but don't block, in case auth is handled at the infrastructure layer
        print("Warning: Missing Authorization header")

    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON request body"}), 400

    request_id = data.get("id")

    # Validate JSON-RPC structure
    if not isinstance(data, dict) or data.get("jsonrpc") != "2.0":
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32600, "message": "Invalid Request: Not a valid JSON-RPC 2.0 request"},
            "id": request_id
        }), 400

    params = data.get("params")
    if not isinstance(params, dict):
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: 'params' must be an object"},
            "id": request_id
        }), 400

    # Parse A2A Message Structure: params -> message -> parts -> [ { text: "..." } ]
    message = params.get("message")
    if not isinstance(message, dict):
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: Missing 'message' object in params"},
            "id": request_id
        }), 400

    parts = message.get("parts")
    if not isinstance(parts, list) or not parts:
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: Missing 'parts' array in message"},
            "id": request_id
        }), 400

    user_prompt = None
    for part in parts:
        if isinstance(part, dict) and "text" in part:
            user_prompt = part["text"]
            break

    if user_prompt is None:
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: No text part found in message.parts"},
            "id": request_id
        }), 400

    request_system_instruction = params.get("system_instruction")

    try:
        # Base generation config
        generation_config = GenerationConfig(
            max_output_tokens=8192,
            temperature=0.7,
            top_p=1.0,
        )

        # Apply system instruction
        if request_system_instruction:
            generation_config.system_instruction = request_system_instruction
        else:
            generation_config.system_instruction = DEFAULT_SYSTEM_INSTRUCTION

        # Call the Gemini API
        response = model.generate_content(
            [user_prompt],
            generation_config=generation_config,
        )

        result_text = response.text

        # Return response in A2A JSON-RPC format
        return jsonify({
            "jsonrpc": "2.0",
            "result": {
                "kind": "Message",
                "message": {
                    "role": "agent",
                    "parts": [
                        {
                            "text": result_text
                        }
                    ]
                }
            },
            "id": request_id
        }), 200

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": "Server error", "data": str(e)},
            "id": request_id
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
`;

const generateDockerfile = (): string => `
# Use an official lightweight Python image.
FROM python:3.10-slim

# Prevent Python from buffering stdout and stderr.
ENV PYTHONUNBUFFERED True

# Set the working directory in the container.
WORKDIR /app

# Copy the requirements file and install dependencies.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application's code.
COPY . .

# Expose the port the app runs on.
EXPOSE 8080

# Run the application with Gunicorn.
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "main:app"]
`;

const generateRequirementsTxt = (): string => `
Flask==3.0.0
gunicorn==22.0.0
google-cloud-aiplatform>=1.55.0
`;

const generateGcloudCommand = (config: FunctionConfig, projectId: string): string => {
    const authFlag = config.allowUnauthenticated ? '--allow-unauthenticated' : '--no-allow-unauthenticated';
    
    return `
#!/bin/bash
# This script deploys the Cloud Run service and then updates it
# with its own public URL, enabling self-discovery for the agent.json endpoint.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration (from UI) ---
PROJECT_ID="${projectId}"
SERVICE_NAME="${config.serviceName}"
REGION="${config.region}"
MEMORY="${config.memory}"
MODEL_NAME="${config.model}"
AGENT_DISPLAY_NAME="${config.displayName}"
AGENT_DESCRIPTION="${config.instruction}" # Using instruction as description
PROVIDER_ORGANIZATION="${config.providerOrganization}"

# --- Pre-flight Check ---
# Check if PROJECT_ID looks like a number (which causes gcloud deploy to fail)
if [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "⚠️  WARNING: PROJECT_ID '$PROJECT_ID' appears to be a Project Number."
  echo "   'gcloud run deploy' requires the Project ID string (e.g., 'my-project-id')."
  echo "   The script will proceed, but it may fail. Please check your configuration if it does."
  echo ""
fi

# --- Deployment ---

echo "Starting deployment of service '$SERVICE_NAME' to project '$PROJECT_ID'..."

# Step 1: Deploy the service from source code.
# We set all environment variables except AGENT_URL, which we don't know yet.
gcloud run deploy "$SERVICE_NAME" \\
  --source . \\
  --project "$PROJECT_ID" \\
  --region "$REGION" \\
  --memory "$MEMORY" \\
  --clear-base-image \\
  ${authFlag} \\
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${projectId},GOOGLE_CLOUD_LOCATION=${config.region},GOOGLE_GENAI_USE_VERTEXAI=TRUE,MODEL=${config.model},AGENT_DISPLAY_NAME='${config.displayName}',AGENT_DESCRIPTION='${config.instruction}',PROVIDER_ORGANIZATION='${config.providerOrganization}'"

echo "Initial deployment complete. Fetching service URL..."

# Step 2: Get the public URL of the newly deployed service.
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "Error: Could not retrieve the service URL. Please check the deployment status in the Google Cloud Console."
    exit 1
fi

echo "Service URL found: $SERVICE_URL"
echo "Updating service to inject its own URL..."

# Step 3: Update the service to set the AGENT_URL environment variable.
# This makes the service self-aware of its public endpoint.
gcloud run services update "$SERVICE_NAME" \\
  --project="$PROJECT_ID" \\
  --region="$REGION" \\
  --update-env-vars="AGENT_URL=$SERVICE_URL"

echo "Deployment and configuration complete."
echo "Your A2A function is now available at: $SERVICE_URL"
`;
};


const A2aFunctionsPage: React.FC<A2aFunctionsPageProps> = ({ projectNumber, setProjectNumber, context }) => {
    const [config, setConfig] = useState<FunctionConfig>({
        serviceName: 'my-a2a-function',
        displayName: 'My A2A Function',
        providerOrganization: 'My Company',
        model: 'gemini-2.5-flash',
        region: 'us-central1',
        memory: '1Gi',
        instruction: 'You are a helpful assistant that responds to user queries directly and concisely.',
        allowUnauthenticated: true,
    });
    
    const [deployProjectId, setDeployProjectId] = useState(projectNumber);
    const [isResolvingId, setIsResolvingId] = useState(false);
    
    const [generatedCode, setGeneratedCode] = useState({
        main: '',
        dockerfile: '',
        requirements: '',
        gcloud: '',
    });
    
    const [activeTab, setActiveTab] = useState<'main' | 'dockerfile' | 'requirements'>('main');
    const [copySuccess, setCopySuccess] = useState('');
    const [isFixMode, setIsFixMode] = useState(false);

    const fetchProjectId = async () => {
        if (!projectNumber) return;
        setIsResolvingId(true);
        try {
            const project = await api.getProject(projectNumber);
            if (project.projectId) {
                setDeployProjectId(project.projectId);
            }
        } catch (e) {
            console.warn("Could not auto-resolve Project ID from Number for gcloud script:", e);
        } finally {
            setIsResolvingId(false);
        }
    };

    // Sync deployProjectId when projectNumber changes from parent
    useEffect(() => {
        setDeployProjectId(projectNumber); // Default to number first
        fetchProjectId();
    }, [projectNumber]);

    // Handle context from navigation (Fix Service workflow)
    useEffect(() => {
        if (context && context.serviceToEdit) {
            const service: CloudRunService = context.serviceToEdit;
            setIsFixMode(true);
            
            const container = service.template?.containers?.[0];
            const envVars = container?.env || [];
            const getEnv = (key: string) => envVars.find(e => e.name === key)?.value || '';

            setConfig(prev => ({
                ...prev,
                serviceName: service.name.split('/').pop() || prev.serviceName,
                region: service.location || prev.region,
                displayName: getEnv('AGENT_DISPLAY_NAME') || prev.displayName,
                providerOrganization: getEnv('PROVIDER_ORGANIZATION') || prev.providerOrganization,
                model: (getEnv('MODEL') as any) || prev.model,
                instruction: getEnv('AGENT_DESCRIPTION') || prev.instruction,
            }));
        }
    }, [context]);

    useEffect(() => {
        setGeneratedCode({
            main: generateMainPy(config.instruction),
            dockerfile: generateDockerfile(),
            requirements: generateRequirementsTxt(),
            gcloud: generateGcloudCommand(config, deployProjectId)
        });
    }, [config, deployProjectId]);
    
    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setConfig(prev => ({...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else if (name === 'serviceName') {
            const sanitizedValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 63);
            setConfig(prev => ({...prev, [name]: sanitizedValue }));
        } else {
            setConfig(prev => ({...prev, [name]: value as any }));
        }
    };
    
    const handleCopy = (content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        });
    };

    const handleDownloadCode = async () => {
        const zip = new JSZip();
        zip.file('main.py', generatedCode.main);
        zip.file('Dockerfile', generatedCode.dockerfile);
        zip.file('requirements.txt', generatedCode.requirements);
        // Include the deployment script
        zip.file('deploy.sh', generatedCode.gcloud);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${config.serviceName}-source.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const codeToDisplay = {
        main: generatedCode.main,
        dockerfile: generatedCode.dockerfile,
        requirements: generatedCode.requirements
    }[activeTab];

    const isNumericId = /^\d+$/.test(deployProjectId);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">A2A Function Builder</h1>
            <p className="text-gray-400 -mt-4">
                Create and deploy a secure, serverless Cloud Run function that can act as a specialized agent or tool. 
                This builder generates code with <strong>CORS support</strong> and <strong>JSON-RPC 2.0</strong> compatibility enabled.
            </p>
            
            {isFixMode && (
                <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg mb-4">
                    <h3 className="text-yellow-400 font-bold mb-1">Fixing Service: {config.serviceName}</h3>
                    <p className="text-sm text-gray-300">
                        The configuration below has been pre-filled from your deployed service. 
                        The generated code now includes the necessary CORS and JSON-RPC headers. 
                        Follow the deployment steps below to update your service.
                    </p>
                </div>
            )}

            {/* Configuration Card */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">1. Configure Your Function</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project Number (for API)</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <div>
                        <label htmlFor="deployProjectId" className="block text-sm font-medium text-gray-400 mb-1">Project ID (for gcloud Script)</label>
                        <div className="flex gap-2">
                            <input 
                                id="deployProjectId" 
                                type="text" 
                                value={deployProjectId} 
                                onChange={(e) => setDeployProjectId(e.target.value)} 
                                className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] ${isNumericId ? 'border-yellow-500 focus:ring-yellow-500' : 'border-gray-600'}`}
                                placeholder="e.g. my-project-id"
                            />
                            <button 
                                onClick={fetchProjectId}
                                disabled={isResolvingId}
                                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white disabled:opacity-50"
                                title="Attempt to resolve Project ID string"
                            >
                                {isResolvingId ? '...' : '↻'}
                            </button>
                        </div>
                        {isNumericId ? (
                            <p className="text-[11px] text-yellow-400 mt-1 font-medium">
                                ⚠️ This looks like a Project Number. The <code>gcloud deploy</code> command requires the <strong>Project ID string</strong> (e.g., 'my-app-prod'). Please replace it manually.
                            </p>
                        ) : (
                            <p className="text-[10px] text-gray-500 mt-1">Required: gcloud requires the string ID, not the number.</p>
                        )}
                    </div>
                     <div>
                        <label htmlFor="serviceName" className="block text-sm font-medium text-gray-400 mb-1">Service Name</label>
                        <input id="serviceName" name="serviceName" type="text" value={config.serviceName} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]" />
                    </div>
                     <div>
                        <label htmlFor="displayName" className="block text-sm font-medium text-gray-400 mb-1">Agent Display Name</label>
                        <input id="displayName" name="displayName" type="text" value={config.displayName} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" />
                    </div>
                     <div>
                        <label htmlFor="providerOrganization" className="block text-sm font-medium text-gray-400 mb-1">Provider Organization</label>
                        <input id="providerOrganization" name="providerOrganization" type="text" value={config.providerOrganization} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" />
                    </div>
                     <div>
                        <label htmlFor="model" className="block text-sm font-medium text-gray-400 mb-1">Gemini Model</label>
                        <select id="model" name="model" value={config.model} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                        </select>
                    </div>
                     <div>
                        <label htmlFor="region" className="block text-sm font-medium text-gray-400 mb-1">Region</label>
                        <select id="region" name="region" value={config.region} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                           <option value="us-central1">us-central1</option><option value="us-east1">us-east1</option><option value="us-east4">us-east4</option><option value="us-west1">us-west1</option><option value="europe-west1">europe-west1</option><option value="europe-west2">europe-west2</option><option value="europe-west4">europe-west4</option><option value="asia-east1">asia-east1</option><option value="asia-southeast1">asia-southeast1</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="memory" className="block text-sm font-medium text-gray-400 mb-1">Memory</label>
                        <select id="memory" name="memory" value={config.memory} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                           <option value="512Mi">512Mi</option><option value="1Gi">1Gi</option><option value="2Gi">2Gi</option><option value="4Gi">4Gi</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                         <label htmlFor="instruction" className="block text-sm font-medium text-gray-400 mb-1">System Instruction (Used for Agent Description)</label>
                         <textarea id="instruction" name="instruction" value={config.instruction} onChange={handleConfigChange} rows={3} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full" />
                    </div>
                    <div className="md:col-span-2 bg-gray-900/50 p-3 rounded-md border border-gray-700">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                name="allowUnauthenticated" 
                                checked={config.allowUnauthenticated} 
                                onChange={handleConfigChange} 
                                className="h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 transition-colors"
                            />
                            <div>
                                <span className="block text-sm font-bold text-white">Allow unauthenticated invocations</span>
                                <span className="block text-xs text-gray-400 mt-0.5">
                                    Required for the "A2A Tester" page to work (browsers cannot authenticate CORS preflight requests).
                                </span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Code Generation Card */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col">
                    <h2 className="text-lg font-semibold text-white mb-3">2. Generated Source Code</h2>
                     <div className="flex justify-between items-center mb-2">
                        <div>
                            <div className="flex border-b border-gray-700">
                                <button onClick={() => setActiveTab('main')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'main' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>main.py</button>
                                <button onClick={() => setActiveTab('dockerfile')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'dockerfile' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>Dockerfile</button>
                                <button onClick={() => setActiveTab('requirements')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'requirements' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>requirements.txt</button>
                            </div>
                        </div>
                        <button onClick={() => handleCopy(codeToDisplay)} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 w-24">
                            {copySuccess || 'Copy'}
                        </button>
                    </div>
                    <div className="bg-gray-900 rounded-b-md flex-1 overflow-auto h-96">
                        <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap"><code>{codeToDisplay}</code></pre>
                    </div>
                </div>
                
                 {/* Deployment Card */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col">
                    <h2 className="text-lg font-semibold text-white mb-3">3. Deploy from Your Terminal</h2>
                    <p className="text-sm text-gray-400 mb-2">Download the source code, unzip it, and run the generated shell script from within the folder to deploy your function.</p>
                     <div className="bg-gray-900 rounded-md flex-1 overflow-auto h-96">
                        <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap"><code>{generatedCode.gcloud}</code></pre>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                        <button onClick={handleDownloadCode} className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-md hover:bg-green-500">
                            Download Source (.zip)
                        </button>
                        <button onClick={() => handleCopy(generatedCode.gcloud)} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500">
                            {copySuccess || 'Copy Script'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default A2aFunctionsPage;
