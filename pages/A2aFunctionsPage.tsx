import React, { useState, useEffect } from 'react';
import ProjectInput from '../components/ProjectInput';

interface A2aFunctionsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

interface FunctionConfig {
    serviceName: string;
    displayName: string;
    providerOrganization: string;
    model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
    region: string;
    memory: string;
    instruction: string;
}

// --- Code Generation Logic ---

const generateMainPy = (instruction: string): string => `
import os
from flask import Flask, request, jsonify
from vertexai.generative_models import GenerativeModel
import json

# Initialization
app = Flask(__name__)

# Load configuration from environment variables
MODEL_NAME = os.getenv("MODEL", "gemini-2.5-flash")
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION")

# Agent card details from environment
AGENT_URL = os.getenv("AGENT_URL", "URL_NOT_SET")
AGENT_DISPLAY_NAME = os.getenv("AGENT_DISPLAY_NAME", "A2A Function")
AGENT_DESCRIPTION = os.getenv("AGENT_DESCRIPTION", "An agent-to-agent function.")
PROVIDER_ORGANIZATION = os.getenv("PROVIDER_ORGANIZATION", "Unknown")


# Initialize the Vertex AI Gemini model
try:
    model = GenerativeModel(MODEL_NAME)
except Exception as e:
    print(f"FATAL: Could not initialize GenerativeModel. Ensure GOOGLE_GENAI_USE_VERTEXAI=TRUE is set. Error: {e}")
    model = None

# This is the instruction provided by the user in the UI
SYSTEM_INSTRUCTION = """
${instruction}
"""

@app.route("/", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "ok"}), 200

@app.route("/.well-known/agent.json", methods=["GET"])
def get_agent_card():
    """Serves the agent's discovery card (agent.json)."""
    card = {
        "name": AGENT_DISPLAY_NAME,
        "description": AGENT_DESCRIPTION,
        "url": AGENT_URL,
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
            "examples": ["Hello, world!"],
            "id": "chat",
            "name": "Chat Skill",
            "tags": ["chat"]
        }],
        "version": "1.0.0"
    }
    return jsonify(card)


@app.route("/invoke", methods=["POST"])
def invoke():
    """
    Main endpoint to invoke the agent-to-agent function.
    Expects a JSON payload with a "prompt" key.
    Example: curl -X POST -H "Authorization: Bearer $(gcloud auth print-identity-token)" \\
             -H "Content-Type: application/json" \\
             -d '{"prompt": "Summarize this for me: ..."}' \\
             https://your-service-url.run.app/invoke
    """
    if not model:
        return jsonify({"error": "Model not initialized"}), 500
        
    # Cloud Run's IAM integration handles the actual token validation.
    # We just ensure the header is present as a basic check.
    if "Authorization" not in request.headers:
        return jsonify({"error": "Unauthorized: Missing Authorization header"}), 401

    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "Missing 'prompt' in request body"}), 400

    user_prompt = data["prompt"]

    try:
        # Call the Gemini API
        response = model.generate_content(
            [user_prompt],
            generation_config={
                "max_output_tokens": 8192,
                "temperature": 0.7,
                "top_p": 1.0,
            },
            system_instruction=SYSTEM_INSTRUCTION,
        )

        result_text = response.text
        return jsonify({"response": result_text}), 200

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return jsonify({"error": "Failed to process request", "details": str(e)}), 500

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

const generateGcloudCommand = (config: FunctionConfig, projectNumber: string): string => `
#!/bin/bash
# This script deploys the Cloud Run service and then updates it
# with its own public URL, enabling self-discovery for the agent.json endpoint.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration (from UI) ---
PROJECT_ID="${projectNumber}"
SERVICE_NAME="${config.serviceName}"
REGION="${config.region}"
MEMORY="${config.memory}"
MODEL_NAME="${config.model}"
AGENT_DISPLAY_NAME="${config.displayName}"
AGENT_DESCRIPTION="${config.instruction}" # Using instruction as description
PROVIDER_ORGANIZATION="${config.providerOrganization}"

# --- Deployment ---

echo "Starting deployment of service '$SERVICE_NAME' to project '$PROJECT_ID'..."

# Step 1: Deploy the service from source code.
# We set all environment variables except AGENT_URL, which we don't know yet.
gcloud run deploy "$SERVICE_NAME" \\
  --source . \\
  --project "$PROJECT_ID" \\
  --region "$REGION" \\
  --memory "$MEMORY" \\
  --no-allow-unauthenticated \\
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${projectNumber},GOOGLE_CLOUD_LOCATION=${config.region},GOOGLE_GENAI_USE_VERTEXAI=TRUE,MODEL=${config.model},AGENT_DISPLAY_NAME='${config.displayName}',AGENT_DESCRIPTION='${config.instruction}',PROVIDER_ORGANIZATION='${config.providerOrganization}'"

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


const A2aFunctionsPage: React.FC<A2aFunctionsPageProps> = ({ projectNumber, setProjectNumber }) => {
    const [config, setConfig] = useState<FunctionConfig>({
        serviceName: 'my-a2a-function',
        displayName: 'My A2A Function',
        providerOrganization: 'My Company',
        model: 'gemini-2.5-flash',
        region: 'us-central1',
        memory: '1Gi',
        instruction: 'You are a helpful assistant that responds to user queries directly and concisely.',
    });
    
    const [generatedCode, setGeneratedCode] = useState({
        main: '',
        dockerfile: '',
        requirements: '',
        gcloud: '',
    });
    
    const [activeTab, setActiveTab] = useState<'main' | 'dockerfile' | 'requirements'>('main');
    const [copySuccess, setCopySuccess] = useState('');

    useEffect(() => {
        setGeneratedCode({
            main: generateMainPy(config.instruction),
            dockerfile: generateDockerfile(),
            requirements: generateRequirementsTxt(),
            gcloud: generateGcloudCommand(config, projectNumber)
        });
    }, [config, projectNumber]);
    
    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'serviceName') {
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

    const codeToDisplay = {
        main: generatedCode.main,
        dockerfile: generatedCode.dockerfile,
        requirements: generatedCode.requirements
    }[activeTab];

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">A2A Function Builder</h1>
            <p className="text-gray-400 -mt-4">
                Create and deploy a secure, serverless Cloud Run function that can act as a specialized agent or tool. 
                This builder now includes an <code className="bg-gray-700 text-xs p-1 rounded">/agent.json</code> endpoint for self-discovery.
            </p>

            {/* Configuration Card */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">1. Configure Your Function</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
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
                     <button onClick={() => handleCopy(generatedCode.gcloud)} className="mt-2 px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 self-end">
                        {copySuccess || 'Copy Script'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default A2aFunctionsPage;