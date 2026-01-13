
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Config, DataStore, CloudRunService, GcsBucket } from '../types';
import * as api from '../services/apiService';
import AgentDeploymentModal from '../components/agent-catalog/AgentDeploymentModal';
import A2aDeployModal from '../components/a2a/A2aDeployModal';
import ProjectInput from '../components/ProjectInput';

declare var JSZip: any;

// Define types for agent config and tools
interface AgentTool {
    type: 'VertexAiSearchTool' | 'A2AClientTool';
    dataStoreId?: string;
    url?: string;
    variableName: string;
    displayName?: string;
}

interface A2aConfig {
    serviceName: string;
    displayName: string;
    providerOrganization: string;
    model: string;
    region: string;
    memory: string;
    instruction: string;
    allowUnauthenticated: boolean;
    enableCors: boolean;
    useGoogleSearch: boolean;
    tools: AgentTool[];
}

// Separate interface for ADK Agent
interface AdkAgentConfig {
    name: string;
    description: string;
    model: string;
    instruction: string;
    tools: AgentTool[];
    useGoogleSearch: boolean;
    enableOAuth: boolean;
    authId: string;
    enableBigQuery: boolean;
    bigQueryWriteMode: 'BLOCKED' | 'ALLOWED';
    enableBqAnalytics: boolean;
    bqDatasetId: string;
    bqTableId: string;
}

// --- Tab Definitions ---
const ADK_TABS = [
    { id: 'agent', label: 'agent.py' },
    { id: 'deploy_re', label: 'deploy_re.py' },
    { id: 'env', label: '.env' },
    { id: 'requirements', label: 'requirements.txt' },
    { id: 'readme', label: 'README.md' }
] as const;

const A2A_TABS = [
    { id: 'main', label: 'main.py' },
    { id: 'dockerfile', label: 'Dockerfile' },
    { id: 'requirements', label: 'requirements.txt' },
    { id: 'env', label: 'env.yaml' }
] as const;

// --- A2A Generators ---
const generateMainPy = (config: A2aConfig): string => {
    const { instruction, enableCors, useGoogleSearch, tools } = config;
    
    const hasTools = useGoogleSearch || tools.length > 0;
    
    let toolImports = '';
    if (hasTools) {
        toolImports = `
# Safe import for tools to prevent crash on older SDKs
try:
    from vertexai.generative_models import Tool, grounding, GoogleSearchRetrieval
except ImportError:
    try:
        from vertexai.generative_models import Tool, grounding
    except ImportError:
        Tool = None
        grounding = None
    GoogleSearchRetrieval = None
`;
    }

    // Generate CORS block
    const corsBlock = enableCors ? `
# --- CORS Configuration ---
# This allows web-based clients (like the A2A Tester) to query this function.
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response` : '';

    // Generate Tools Initialization Code
    let toolsInit = 'tools = []';
    if (hasTools) {
        let toolCode: string[] = [];
        toolCode.push('if Tool:'); // Only proceed if Tool class exists
        
        if (useGoogleSearch) {
            toolCode.push('    try:');
            toolCode.push('        if GoogleSearchRetrieval:');
            toolCode.push('            tools.append(Tool.from_google_search_retrieval(GoogleSearchRetrieval()))');
            toolCode.push('            print("Google Search tool enabled.")');
            toolCode.push('        else:');
            toolCode.push('            print("Warning: GoogleSearchRetrieval class missing in installed SDK. Google Search tool disabled.")');
            toolCode.push('    except Exception as e:');
            toolCode.push('        print(f"Warning: Failed to enable Google Search: {e}")');
        }
        
        tools.forEach(tool => {
            if (tool.type === 'VertexAiSearchTool' && tool.dataStoreId) {
                toolCode.push('    try:');
                toolCode.push('        tools.append(Tool.from_retrieval(');
                toolCode.push('            grounding.Retrieval(');
                toolCode.push(`                grounding.VertexAISearch(datastore="${tool.dataStoreId}")`);
                toolCode.push('            )');
                toolCode.push('        ))');
                toolCode.push(`        print("Data Store tool enabled: ${tool.dataStoreId}")`);
                toolCode.push('    except Exception as e:');
                toolCode.push(`        print(f"Warning: Failed to enable Data Store ${tool.dataStoreId}: {e}")`);
            }
        });
        
        if (toolCode.length > 1) { // Check if we added more than just the guard check
            toolsInit = `tools = []\n${toolCode.join('\n')}`;
        }
    }

    return `
import os
from flask import Flask, request, jsonify
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
${toolImports}
import json

# Initialization
app = Flask(__name__)
${corsBlock}

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

# Initialize Tools
${toolsInit}

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
        "url": f"{AGENT_URL.rstrip('/')}/invoke",
        "capabilities": {
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
        
    if "Authorization" not in request.headers:
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

        # Call the Gemini API with tools
        response = model.generate_content(
            [user_prompt],
            generation_config=generation_config,
            tools=tools
        )

        result_text = response.text

        # Return response in A2A JSON-RPC format
        return jsonify({
            "jsonrpc": "2.0",
            "result": {
                "kind": "conversationMessage",
                "message": {
                    "role": "model",
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
}

const generateA2aEnvYaml = (config: A2aConfig, projectId: string): string => {
    return `GOOGLE_CLOUD_PROJECT: "${projectId}"
GOOGLE_CLOUD_LOCATION: "${config.region}"
GOOGLE_GENAI_USE_VERTEXAI: "TRUE"
MODEL: "${config.model}"
AGENT_DISPLAY_NAME: "${config.displayName}"
PROVIDER_ORGANIZATION: "${config.providerOrganization}"
AGENT_DESCRIPTION: |
${config.instruction.split('\n').map(line => '  ' + line).join('\n')}
`.trim();
};

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
google-cloud-aiplatform>=1.75.0
`;

const generateGcloudCommand = (config: A2aConfig, projectId: string): string => {
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

# --- Pre-flight Check ---
if [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "⚠️  WARNING: PROJECT_ID '$PROJECT_ID' appears to be a Project Number."
  echo "   'gcloud run deploy' requires the Project ID string (e.g., 'my-project-id')."
  echo "   The script will proceed, but it may fail. Please check your configuration if it does."
  echo ""
fi

# --- Deployment ---

echo "Starting deployment of service '$SERVICE_NAME' to project '$PROJECT_ID'..."

gcloud run deploy "$SERVICE_NAME" \\
  --source . \\
  --project "$PROJECT_ID" \\
  --region "$REGION" \\
  --memory "$MEMORY" \\
  --clear-base-image \\
  ${authFlag} \\
  --env-vars-file=env.yaml

echo "Initial deployment complete. Fetching service URL..."

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "Error: Could not retrieve the service URL. Please check the deployment status in the Google Cloud Console."
    exit 1
fi

echo "Service URL found: $SERVICE_URL"
echo "Updating service with own URL..."

gcloud run services update "$SERVICE_NAME" \\
  --project="$PROJECT_ID" \\
  --region="$REGION" \\
  --update-env-vars="AGENT_URL=$SERVICE_URL"

echo "Deployment and configuration complete."
echo "Your A2A function is now available at: $SERVICE_URL"
`;
};

// --- ADK Generators ---

const generateAdkPythonCode = (config: AdkAgentConfig): string => {
    const toolImports = new Set<string>();
    const toolInitializations: string[] = [];
    const toolListForAgent: string[] = [];
    const pluginsImports = new Set<string>();
    const pluginInitializations: string[] = [];
    const pluginList: string[] = [];
    
    let oauthToolCodeBlock = '';
    let a2aClassCode = '';
    
    const agentClass = 'Agent';
    const agentImport = 'from google.adk.agents import Agent';
    const adkAppImport = 'from google.adk.apps import App';

    toolImports.add('import google.auth');

    // Inject A2A Helper Function
    if (config.tools.some(t => t.type === 'A2AClientTool')) {
        a2aClassCode = `
import requests
import google.auth.transport.requests
import google.oauth2.id_token

def create_a2a_tool(url: str, tool_name: str):
    """Creates a callable function tool to interact with an A2A agent."""
    
    def a2a_interaction(message: str) -> str:
        """Sends a message to the specific agent and returns the response."""
        invoke_url = url.rstrip('/') + "/invoke"
        payload = {
            "jsonrpc": "2.0",
            "method": "chat",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"text": message}]
                }
            },
            "id": "1"
        }
        
        headers = {"Content-Type": "application/json"}
        
        try:
            auth_req = google.auth.transport.requests.Request()
            target_audience = url.replace("/invoke", "").rstrip('/')
            id_token = google.oauth2.id_token.fetch_id_token(auth_req, target_audience)
            headers["Authorization"] = f"Bearer {id_token}"
        except Exception as e:
            print(f"Warning: Auth token fetch failed for A2A: {e}")

        try:
            response = requests.post(invoke_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                return f"Error from agent: {data['error']}"
            return data.get("result", {}).get("message", {}).get("parts", [{}])[0].get("text", str(data))
        except Exception as e:
            return f"Communication failed: {e}"

    a2a_interaction.__name__ = tool_name
    return a2a_interaction
`;
    }

    config.tools.forEach(tool => {
        if (tool.type === 'VertexAiSearchTool' && tool.dataStoreId) {
            toolImports.add('from google.adk.tools import VertexAiSearchTool');
            toolInitializations.push(
                `${tool.variableName} = VertexAiSearchTool(\n    data_store_id="${tool.dataStoreId}"\n)`
            );
            toolListForAgent.push(tool.variableName);
        } else if (tool.type === 'A2AClientTool' && tool.url) {
            const funcName = tool.variableName || 'a2a_tool';
            toolInitializations.push(
                `${tool.variableName} = create_a2a_tool(\n    url="${tool.url}",\n    tool_name="${funcName}"\n)`
            );
            toolListForAgent.push(tool.variableName);
        }
    });

    if (config.useGoogleSearch) {
        toolImports.add('from google.adk.tools import google_search');
        toolListForAgent.push('google_search');
    }
    
    if (config.enableBigQuery) {
        toolImports.add('from google.adk.tools.bigquery import BigQueryCredentialsConfig, BigQueryToolset');
        toolImports.add('from google.adk.tools.bigquery.config import BigQueryToolConfig, WriteMode');
        
        toolInitializations.push(`# BigQuery Tool Configuration
bq_tool_config = BigQueryToolConfig(write_mode=WriteMode.${config.bigQueryWriteMode})
# Use default runtime credentials (ADC) to avoid pickling build-time credentials
bq_creds_config = BigQueryCredentialsConfig() 
bigquery_toolset = BigQueryToolset(credentials_config=bq_creds_config, bigquery_tool_config=bq_tool_config)`);
        toolListForAgent.push('bigquery_toolset');
    }
    
    if (config.enableBqAnalytics) {
        pluginsImports.add('from google.adk.plugins.bigquery_agent_analytics_plugin import BigQueryAgentAnalyticsPlugin');
        pluginInitializations.push(`# BigQuery Analytics Plugin
bq_logging_plugin = BigQueryAgentAnalyticsPlugin(
    project_id=os.environ.get("GOOGLE_CLOUD_PROJECT"),
    dataset_id="${config.bqDatasetId}",
    table_id="${config.bqTableId || 'agent_events'}"
)`);
        pluginList.push('bq_logging_plugin');
    }
    
    if (config.enableOAuth) {
        toolImports.add('from google.adk.tools import ToolContext');
        toolImports.add('from google.oauth2.credentials import Credentials');
        toolImports.add('from googleapiclient.discovery import build');
        oauthToolCodeBlock = `
def get_email_from_token(access_token):
    """Get user info from access token"""
    credentials = Credentials(token=access_token)
    service = build('oauth2', 'v2', credentials=credentials)
    user_info = service.userinfo().get().execute()
    user_email = user_info.get('email')
    return user_email

def lazy_mask_token(access_token):
    """Mask access token for printing"""
    return f"{access_token[:4]}...{access_token[-4:]}"

def print_tool_context(tool_context: ToolContext):
    """ADK Tool to get email and masked token from Gemini Enterprise"""
    auth_id = os.getenv("AUTH_ID")
    access_token = tool_context.state[f"temp:{auth_id}"]
    user_email = get_email_from_token(access_token)
    tool_context.state["user_email"] = user_email
    
    return {
        f"temp:{auth_id}": lazy_mask_token(access_token),
        "user_email": user_email
    }
`;
        toolListForAgent.push('print_tool_context');
    }

    const formatPythonString = (str: string) => {
        const needsTripleQuotes = str.includes('\n') || str.includes('"');
        if (needsTripleQuotes) {
            const escapedStr = str.replace(/"""/g, '\\"\\"\\"');
            return `"""${escapedStr}"""`;
        }
        return `"${str.replace(/"/g, '\\"')}"`;
    };

    const imports = [
        'import os',
        'from dotenv import load_dotenv',
        agentImport,
        'from vertexai.preview import reasoning_engines',
        ...Array.from(toolImports),
        ...Array.from(pluginsImports),
    ];

    const hasPlugins = pluginList.length > 0;
    if (hasPlugins) {
        imports.push(adkAppImport);
    }

    return `
${imports.join('\n')}

load_dotenv()

${a2aClassCode}

${oauthToolCodeBlock}
# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join('\n\n') : '# No additional tools defined'}

# Initialize Plugins
${pluginInitializations.length > 0 ? pluginInitializations.join('\n\n') : '# No plugins defined'}

# Define the root agent
root_agent = ${agentClass}(
    name=${formatPythonString(config.name)},
    description=${formatPythonString(config.description)},
    model=os.getenv("MODEL", ${formatPythonString(config.model)}),
    instruction=${formatPythonString(config.instruction)},
    tools=[${toolListForAgent.join(', ')}],
)

${hasPlugins ? `
# Define the ADK App with plugins
adk_app = App(
    name=${formatPythonString(config.name)},
    root_agent=root_agent,
    plugins=[${pluginList.join(', ')}],
)
` : ''}

# Define the App for Vertex AI Reasoning Engine
# Note: Root agent is wrapped in AdkApp as requested.
app = reasoning_engines.AdkApp(
    agent=${hasPlugins ? 'adk_app' : 'root_agent'},
    enable_tracing=False
)
`.trim();
};

const generateAdkDeployScript = (config: AdkAgentConfig): string => {
    return `
import os
import logging
import vertexai
from vertexai.preview import reasoning_engines

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION")
staging_bucket = os.getenv("STAGING_BUCKET")

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)

try:
    import agent
    if hasattr(agent, 'app'):
        # If the user defined an App, use it.
        app_obj = agent.app
        logger.info("Imported 'app' from agent.py")
    else:
        # Fallback to root_agent
        logger.info("Imported 'root_agent' from agent.py")
        app_obj = agent.root_agent
        
    logger.info("Agent imported successfully.")
except ImportError as e:
    logger.error(f"Failed to import agent: {e}")
    raise

# Read requirements
reqs = ["google-cloud-aiplatform[adk,agent_engines]>=1.75.0", "python-dotenv"]
if os.path.exists("requirements.txt"):
    with open("requirements.txt", "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                reqs.append(line)
reqs = list(set(reqs))

# --- CRITICAL FIX FOR Pydantic ValidationError ---
# We check if the app_obj is already an AdkApp instance by checking key attributes or class name.
# This prevents 'double-wrapping' which causes the 'Input should be a valid dictionary or instance of BaseAgent' error.
is_already_adk_app = (
    hasattr(app_obj, 'agent') or
    hasattr(app_obj, '_agent') or
    app_obj.__class__.__name__ == 'AdkApp'
)

if is_already_adk_app:
     app_to_deploy = app_obj
     logger.info(f"App is already an AdkApp instance ({type(app_obj).__name__}). Proceeding to deploy...")
else:
     logger.info("Wrapping agent in AdkApp for deployment...")
     app_to_deploy = reasoning_engines.AdkApp(agent=app_obj, enable_tracing=False)

logger.info("Creating Reasoning Engine...")
remote_app = reasoning_engines.ReasoningEngine.create(
    app_to_deploy,
    requirements=reqs,
    display_name=os.getenv("AGENT_DISPLAY_NAME", "${config.name || 'my-agent'}"),
)

print(f"Deployment finished!")
print(f"Resource Name: {remote_app.resource_name}")
`.trim();
};

const generateAdkEnvFile = (config: AdkAgentConfig, projectNumber: string, location: string): string => {
    let content = `GOOGLE_GENAI_USE_VERTEXAI=TRUE
MODEL="${config.model}"
GOOGLE_CLOUD_PROJECT="${projectNumber}"
GOOGLE_CLOUD_LOCATION="${location}"
STAGING_BUCKET="gs://YOUR_BUCKET_NAME"
AGENT_DISPLAY_NAME="${config.name}"`;

    if (config.enableOAuth && config.authId) {
        content += `\nAUTH_ID="${config.authId}"`;
    }
    
    if (config.enableBqAnalytics) {
        content += `\nBIG_QUERY_DATASET_ID="${config.bqDatasetId}"`;
    }
    
    return content.trim();
};

const generateAdkRequirementsFile = (config: AdkAgentConfig): string => {
    const requirements = new Set([
        'google-cloud-aiplatform[adk,agent_engines]>=1.75.0', 
        'python-dotenv'
    ]);
    if (config.enableOAuth || config.tools.some(t => t.type === 'A2AClientTool')) {
        requirements.add('google-auth-oauthlib>=1.2.2');
        requirements.add('google-api-python-client');
        requirements.add('google-auth');
    }
    if (config.tools.some(t => t.type === 'A2AClientTool')) {
        requirements.add('requests');
    }
    if (config.enableBigQuery || config.enableBqAnalytics) {
        requirements.add('google-cloud-bigquery');
        requirements.add('google-auth');
        requirements.add('db-dtypes'); 
    }
    return Array.from(requirements).join('\n');
};

const generateAdkReadmeFile = (config: AdkAgentConfig): string => {
    return `
# Agent Quickstart

This agent was created using the Gemini Enterprise Manager Agent Builder (ADK).

## Deployment

1.  **Install ADK:**
    \`\`\`sh
    pip install "google-cloud-aiplatform[adk,agent_engines]>=1.75.0"
    \`\`\`

2.  **Install dependencies:**
    \`\`\`sh
    pip install -r requirements.txt
    \`\`\`

3.  **Deploy to Vertex AI:**
    Ensure you have set \`GOOGLE_CLOUD_PROJECT\`, \`GOOGLE_CLOUD_LOCATION\`, and \`STAGING_BUCKET\` in your \`.env\` file.
    
    Run the deploy script:
    \`\`\`sh
    python deploy_re.py
    \`\`\`
`.trim();
};


interface AgentBuilderPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: any;
  onBuildTriggered?: (buildId: string) => void;
}

const AgentBuilderPage: React.FC<AgentBuilderPageProps> = ({ projectNumber, setProjectNumber, context, onBuildTriggered }) => {
    const [builderTab, setBuilderTab] = useState<'a2a' | 'adk'>('adk');
    
    // --- A2A State ---
    const [a2aConfig, setA2aConfig] = useState<A2aConfig>({
        serviceName: 'my-a2a-function',
        displayName: 'My A2A Function',
        providerOrganization: 'My Company',
        model: 'gemini-2.5-flash',
        region: 'us-central1',
        memory: '1Gi',
        instruction: 'You are a helpful assistant that responds to user queries directly and concisely.',
        allowUnauthenticated: true,
        enableCors: true,
        useGoogleSearch: false,
        tools: [],
    });
    
    const [deployProjectId, setDeployProjectId] = useState(projectNumber);
    const [isResolvingId, setIsResolvingId] = useState(false);
    
    const [a2aGeneratedCode, setA2aGeneratedCode] = useState({
        main: '',
        dockerfile: '',
        requirements: '',
        gcloud: '',
        yaml: '',
    });
    
    const [a2aActiveTab, setA2aActiveTab] = useState<'main' | 'dockerfile' | 'requirements' | 'env'>('main');
    const [a2aCopySuccess, setA2aCopySuccess] = useState('');
    const [isFixMode, setIsFixMode] = useState(false);
    const [isA2aDeployModalOpen, setIsA2aDeployModalOpen] = useState(false);

    // --- ADK State ---
    const [adkConfig, setAdkConfig] = useState<AdkAgentConfig>({
        name: '',
        description: 'An agent that can do awesome things.',
        model: 'gemini-2.5-flash',
        instruction: 'You are an awesome and helpful agent.',
        tools: [],
        useGoogleSearch: false,
        enableOAuth: false,
        authId: '',
        enableBigQuery: false,
        bigQueryWriteMode: 'BLOCKED',
        enableBqAnalytics: false,
        bqDatasetId: '',
        bqTableId: '' 
    });
    const [vertexLocation, setVertexLocation] = useState('us-central1');
    const [adkGeneratedCode, setAdkGeneratedCode] = useState({ agent: '', env: '', requirements: '', readme: '', deploy_re: '' });
    const [adkActiveTab, setAdkActiveTab] = useState<'agent' | 'env' | 'requirements' | 'readme' | 'deploy_re'>('agent');
    const [adkCopySuccess, setAdkCopySuccess] = useState('');
    
    // Data Store Tool State
    const [toolBuilderConfig, setToolBuilderConfig] = useState({ dataStoreId: '' });
    const [dataStores, setDataStores] = useState<(DataStore & { location: string })[]>([]);
    const [isLoadingDataStores, setIsLoadingDataStores] = useState(false);
    const [dataStoreSearchTerm, setDataStoreSearchTerm] = useState('');
    
    // A2A Tool State
    const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [selectedA2aService, setSelectedA2aService] = useState('');
    const [a2aSearchTerm, setA2aSearchTerm] = useState('');

    const [isAdkDeployModalOpen, setIsAdkDeployModalOpen] = useState(false);
    const [rewritingField, setRewritingField] = useState<string | null>(null);

    // BigQuery State
    const [bqDatasets, setBqDatasets] = useState<any[]>([]);
    const [bqTables, setBqTables] = useState<any[]>([]);
    const [isLoadingBqDatasets, setIsLoadingBqDatasets] = useState(false);
    const [isLoadingBqTables, setIsLoadingBqTables] = useState(false);
    const [bqTablesError, setBqTablesError] = useState<string | null>(null);
    
    // --- Common Logic ---
    const fetchProjectId = async () => {
        if (!projectNumber) return;
        setIsResolvingId(true);
        try {
            const project = await api.getProject(projectNumber);
            if (project.projectId) {
                setDeployProjectId(project.projectId);
            }
        } catch (e) {
            console.warn("Could not auto-resolve Project ID from Number:", e);
        } finally {
            setIsResolvingId(false);
        }
    };

    useEffect(() => {
        setDeployProjectId(projectNumber); 
        fetchProjectId();
    }, [projectNumber]);

    // Handle Fix Mode context
    useEffect(() => {
        if (context && context.serviceToEdit) {
            setBuilderTab('a2a');
            setIsFixMode(true);
            const service: CloudRunService = context.serviceToEdit;
            const container = service.template?.containers?.[0];
            const envVars = container?.env || [];
            const getEnv = (key: string) => envVars.find(e => e.name === key)?.value || '';

            setA2aConfig(prev => ({
                ...prev,
                serviceName: service.name.split('/').pop() || prev.serviceName,
                region: service.location || prev.region,
                displayName: getEnv('AGENT_DISPLAY_NAME') || prev.displayName,
                providerOrganization: getEnv('PROVIDER_ORGANIZATION') || prev.providerOrganization,
                model: getEnv('MODEL') || prev.model,
                instruction: getEnv('AGENT_DESCRIPTION') || prev.instruction,
            }));
        }
    }, [context]);

    // A2A Code Generation
    useEffect(() => {
        setA2aGeneratedCode({
            main: generateMainPy(a2aConfig),
            dockerfile: generateDockerfile(),
            requirements: generateRequirementsTxt(),
            gcloud: generateGcloudCommand(a2aConfig, deployProjectId),
            yaml: generateA2aEnvYaml(a2aConfig, deployProjectId)
        });
    }, [a2aConfig, deployProjectId]);

    // ADK Code Generation
    useEffect(() => {
        const agentCode = generateAdkPythonCode(adkConfig);
        const envCode = generateAdkEnvFile(adkConfig, projectNumber, vertexLocation);
        const reqsCode = generateAdkRequirementsFile(adkConfig);
        const readmeCode = generateAdkReadmeFile(adkConfig);
        const deployCode = generateAdkDeployScript(adkConfig);
        setAdkGeneratedCode({ agent: agentCode, env: envCode, requirements: reqsCode, readme: readmeCode, deploy_re: deployCode });
    }, [adkConfig, projectNumber, vertexLocation]);

    // ADK Data Store & Buckets Fetching
    const apiConfig = useMemo(() => ({
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: ''
    }), [projectNumber]);

    useEffect(() => {
      if (!projectNumber) return;
      
      const fetchData = async () => {
        setIsLoadingDataStores(true);
        setDataStores([]);
        
        const locations = ['global', 'us', 'eu'];
        const dsResults: (DataStore & { location: string })[] = [];

        await Promise.all(locations.map(async (loc) => {
             const dsConfig = {
                projectId: projectNumber,
                appLocation: loc,
                collectionId: 'default_collection',
                appId: '',
                assistantId: ''
             };
             try {
                 const res = await api.listResources('dataStores', dsConfig);
                 if (res.dataStores) {
                     res.dataStores.forEach((ds: any) => dsResults.push({ ...ds, location: loc }));
                 }
             } catch(e) { }
        }));
        
        setDataStores(dsResults);
        if (dsResults.length === 1 && !toolBuilderConfig.dataStoreId) {
            setToolBuilderConfig(prev => ({...prev, dataStoreId: dsResults[0].name}));
        }
        setIsLoadingDataStores(false);

        setIsLoadingServices(true);
        setCloudRunServices([]);
        const regions = ['us-central1', 'us-east1', 'europe-west1', 'asia-east1']; 
        const services: CloudRunService[] = [];
        
        await Promise.all(regions.map(async (region) => {
            try {
                const res = await api.listCloudRunServices({ projectId: projectNumber } as any, region);
                if (res.services) services.push(...res.services);
            } catch (e) {}
        }));
        
        const a2a = services.filter(s => {
             const envVars = s.template?.containers?.[0]?.env || [];
             const getEnv = (name: string) => envVars.find(e => e.name === name)?.value;
             return !!(getEnv('AGENT_URL') || getEnv('PROVIDER_ORGANIZATION') || s.name.toLowerCase().includes('a2a'));
        });
        
        setCloudRunServices(a2a);
        setIsLoadingServices(false);
      };
      
      fetchData();
    }, [projectNumber]);

    // BigQuery Fetching
    const fetchBqDatasets = useCallback(async () => {
        if (!deployProjectId) return;
        setIsLoadingBqDatasets(true);
        try {
            const res = await api.listBigQueryDatasets(deployProjectId);
            setBqDatasets(res.datasets || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingBqDatasets(false);
        }
    }, [deployProjectId]);

    const fetchBqTables = useCallback(async () => {
        if (!deployProjectId || !adkConfig.bqDatasetId) return;
        setIsLoadingBqTables(true);
        setBqTablesError(null);
        try {
            const res = await api.listBigQueryTables(deployProjectId, adkConfig.bqDatasetId);
            setBqTables(res.tables || []);
        } catch (e: any) {
            console.error(e);
            setBqTablesError(e.message || "Failed to load tables");
        } finally {
            setIsLoadingBqTables(false);
        }
    }, [deployProjectId, adkConfig.bqDatasetId]);

    useEffect(() => {
        if (adkConfig.enableBqAnalytics) {
            fetchBqDatasets();
        }
    }, [adkConfig.enableBqAnalytics, fetchBqDatasets]);

    useEffect(() => {
        if (adkConfig.enableBqAnalytics && adkConfig.bqDatasetId) {
            fetchBqTables();
        } else {
            setBqTables([]);
        }
    }, [adkConfig.enableBqAnalytics, adkConfig.bqDatasetId, fetchBqTables]);


    // --- Handlers ---
    const handleA2aConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setA2aConfig(prev => ({...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else if (name === 'serviceName') {
            const sanitizedValue = value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 63);
            setA2aConfig(prev => ({...prev, [name]: sanitizedValue }));
        } else {
            setA2aConfig(prev => ({...prev, [name]: value as any }));
        }
    };

    const handleAdkConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setAdkConfig(prev => ({...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else if (name === 'name') {
             const sanitizedValue = value.replace(/\s+/g, '_');
             setAdkConfig(prev => ({...prev, [name]: sanitizedValue }));
        } else {
            setAdkConfig(prev => ({...prev, [name]: value as any }));
        }
    };

    const handleAddTool = (tool: AgentTool) => {
        if (builderTab === 'a2a') {
            setA2aConfig(prev => ({ ...prev, tools: [...prev.tools, tool] }));
        } else {
            setAdkConfig(prev => ({ ...prev, tools: [...prev.tools, tool] }));
        }
    };

    const handleRemoveTool = (index: number) => {
        if (builderTab === 'a2a') {
            setA2aConfig(prev => ({ ...prev, tools: prev.tools.filter((_, i) => i !== index) }));
        } else {
            setAdkConfig(prev => ({ ...prev, tools: prev.tools.filter((_, i) => i !== index) }));
        }
    };

    const handleRewrite = async (field: 'instruction') => {
        setRewritingField(field);
        
        const currentInstruction = builderTab === 'a2a' ? a2aConfig.instruction : adkConfig.instruction;
        const prompt = `You are an expert prompt engineer. Your task is to rewrite the following system instruction to be highly effective for a Large Language Model (LLM).
        Structure the rewritten prompt clearly.
        Add necessary context and details to make the agent robust while preserving the user's original intent.
        Output ONLY the rewritten system instruction.
        
        Original Instruction: "${currentInstruction}"`;

        try {
            const text = await api.generateVertexContent(apiConfig, prompt, 'gemini-2.5-flash');
            const rewrittenText = text.trim().replace(/^["']|["']$/g, '').replace(/^```\w*\n?|\n?```$/g, '').trim();
            if (builderTab === 'a2a') {
                setA2aConfig(prev => ({ ...prev, instruction: rewrittenText }));
            } else {
                setAdkConfig(prev => ({ ...prev, instruction: rewrittenText }));
            }
        } catch (err: any) {
            alert(`AI rewrite failed: ${err.message}`);
        } finally {
            setRewritingField(null);
        }
    };

    const handleCopy = (content: string, setSuccess: React.Dispatch<React.SetStateAction<string>>) => {
        navigator.clipboard.writeText(content).then(() => {
            setSuccess('Copied!');
            setTimeout(() => setSuccess(''), 2000);
        });
    };

    const handleDownloadA2a = async () => {
        const zip = new JSZip();
        zip.file('main.py', a2aGeneratedCode.main);
        zip.file('Dockerfile', a2aGeneratedCode.dockerfile);
        zip.file('requirements.txt', a2aGeneratedCode.requirements);
        zip.file('deploy.sh', a2aGeneratedCode.gcloud);
        zip.file('env.yaml', a2aGeneratedCode.yaml);
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${a2aConfig.serviceName}-source.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadAdk = async () => {
        const zip = new JSZip();
        zip.file('agent.py', adkGeneratedCode.agent);
        zip.file('.env', adkGeneratedCode.env);
        zip.file('requirements.txt', adkGeneratedCode.requirements);
        zip.file('README.md', adkGeneratedCode.readme);
        zip.file('deploy_re.py', adkGeneratedCode.deploy_re);
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${adkConfig.name || 'agent'}-source.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const adkCodeDisplay = { 
        agent: adkGeneratedCode.agent, 
        env: adkGeneratedCode.env, 
        requirements: adkGeneratedCode.requirements, 
        readme: adkGeneratedCode.readme,
        deploy_re: adkGeneratedCode.deploy_re
    }[adkActiveTab];

    const a2aCodeDisplay = { 
        main: a2aGeneratedCode.main, 
        dockerfile: a2aGeneratedCode.dockerfile, 
        requirements: a2aGeneratedCode.requirements, 
        env: a2aGeneratedCode.yaml 
    }[a2aActiveTab];

    const adkFilesForBuild = [
        { name: 'agent.py', content: adkGeneratedCode.agent },
        { name: '.env', content: adkGeneratedCode.env },
        { name: 'requirements.txt', content: adkGeneratedCode.requirements },
        { name: 'README.md', content: adkGeneratedCode.readme },
        { name: 'deploy_re.py', content: adkGeneratedCode.deploy_re }
    ];

    const a2aFilesForBuild = [
        { name: 'main.py', content: a2aGeneratedCode.main },
        { name: 'Dockerfile', content: a2aGeneratedCode.dockerfile },
        { name: 'requirements.txt', content: a2aGeneratedCode.requirements },
        { name: 'deploy.sh', content: a2aGeneratedCode.gcloud },
        { name: 'env.yaml', content: a2aGeneratedCode.yaml }
    ];

    const handleBuildTriggered = (id: string) => {
        if (onBuildTriggered) onBuildTriggered(id);
        setIsA2aDeployModalOpen(false);
        setIsAdkDeployModalOpen(false);
    };

    return (
        <div className="space-y-6 flex flex-col lg:h-full">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-bold text-white">Agent Builder</h1>
                <div className="bg-gray-800 p-1 rounded-lg border border-gray-700">
                    <button onClick={() => setBuilderTab('adk')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${builderTab === 'adk' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>ADK Agent (Engine)</button>
                    <button onClick={() => setBuilderTab('a2a')} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${builderTab === 'a2a' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>A2A Function (Cloud Run)</button>
                </div>
            </div>
            
            {/* Deploy Modals */}
            <AgentDeploymentModal isOpen={isAdkDeployModalOpen} onClose={() => setIsAdkDeployModalOpen(false)} agentName={adkConfig.name || 'my-agent'} files={adkFilesForBuild} projectNumber={projectNumber} onBuildTriggered={handleBuildTriggered} />
            <A2aDeployModal isOpen={isA2aDeployModalOpen} onClose={() => setIsA2aDeployModalOpen(false)} projectNumber={projectNumber} serviceName={a2aConfig.serviceName} region={a2aConfig.region} files={a2aFilesForBuild} onBuildTriggered={handleBuildTriggered} />
            
            {isFixMode && builderTab === 'a2a' && (
                <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg shrink-0">
                    <h3 className="text-yellow-400 font-bold mb-1">Fixing Service: {a2aConfig.serviceName}</h3>
                    <p className="text-sm text-gray-300">Configuration pre-filled from deployed service.</p>
                </div>
            )}

            {/* Layout Container */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* Left Column: Configuration (Box 1) */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-md lg:w-1/3 flex flex-col overflow-y-auto border border-gray-700">
                    <h2 className="text-lg font-semibold text-white mb-3 shrink-0">1. Configure Agent</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Project Number</label>
                            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                        </div>
                        
                        {builderTab === 'adk' ? (
                            <>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Agent Name</label><input name="name" type="text" value={adkConfig.name} onChange={handleAdkConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Description</label><input name="description" type="text" value={adkConfig.description} onChange={handleAdkConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Agent Location</label>
                                    <select value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                                        <option value="us-central1">us-central1</option><option value="europe-west1">europe-west1</option><option value="asia-east1">asia-east1</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
                                    <select name="model" value={adkConfig.model} onChange={handleAdkConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                                        <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">Instruction</label>
                                        <button onClick={() => handleRewrite('instruction')} disabled={rewritingField === 'instruction'} className="text-xs text-blue-400 hover:text-blue-300">{rewritingField === 'instruction' ? '...' : 'AI Rewrite'}</button>
                                    </div>
                                    <textarea name="instruction" value={adkConfig.instruction} onChange={handleAdkConfigChange} rows={4} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full" />
                                </div>
                                <div className="space-y-2 pt-2 border-t border-gray-600">
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="useGoogleSearch" checked={adkConfig.useGoogleSearch} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable Google Search Tool</span></label>
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="enableOAuth" checked={adkConfig.enableOAuth} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable OAuth (User Context)</span></label>
                                    {adkConfig.enableOAuth && (
                                        <div className="pl-7"><input type="text" name="authId" value={adkConfig.authId} onChange={handleAdkConfigChange} placeholder="Authorization Resource ID" className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full" /></div>
                                    )}
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="enableBigQuery" checked={adkConfig.enableBigQuery} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable BigQuery Tool</span></label>
                                    {adkConfig.enableBigQuery && (
                                        <div className="pl-7">
                                            <label className="block text-xs font-medium text-gray-400 mb-1">Write Mode</label>
                                            <select name="bigQueryWriteMode" value={adkConfig.bigQueryWriteMode} onChange={handleAdkConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full">
                                                <option value="BLOCKED">BLOCKED (Read-only)</option>
                                                <option value="ALLOWED">ALLOWED (Read/Write)</option>
                                            </select>
                                        </div>
                                    )}
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="enableBqAnalytics" checked={adkConfig.enableBqAnalytics} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable BigQuery Analytics Plugin</span></label>
                                    {adkConfig.enableBqAnalytics && (
                                        <div className="pl-7 space-y-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-400 mb-1">Dataset ID</label>
                                                <div className="flex gap-2">
                                                    <select 
                                                        name="bqDatasetId" 
                                                        value={adkConfig.bqDatasetId} 
                                                        onChange={handleAdkConfigChange} 
                                                        className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                                                        disabled={isLoadingBqDatasets}
                                                    >
                                                        <option value="">-- Select Dataset --</option>
                                                        {bqDatasets.map(d => (
                                                            <option key={d.datasetReference.datasetId} value={d.datasetReference.datasetId}>
                                                                {d.datasetReference.datasetId}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button onClick={fetchBqDatasets} className="px-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs text-white" disabled={isLoadingBqDatasets}>↻</button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-400 mb-1">Table ID</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        name="bqTableId" 
                                                        value={adkConfig.bqTableId} 
                                                        onChange={handleAdkConfigChange} 
                                                        list="bq-tables-list"
                                                        placeholder="agent_events" 
                                                        className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full" 
                                                        disabled={!adkConfig.bqDatasetId}
                                                    />
                                                    <datalist id="bq-tables-list">
                                                        {bqTables.map(t => (
                                                            <option key={t.tableReference.tableId} value={t.tableReference.tableId} />
                                                        ))}
                                                    </datalist>
                                                    <button onClick={fetchBqTables} className="px-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs text-white" disabled={isLoadingBqTables || !adkConfig.bqDatasetId}>↻</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Project ID</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={deployProjectId} onChange={(e) => setDeployProjectId(e.target.value)} className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] ${/^\d+$/.test(deployProjectId) ? 'border-yellow-500' : 'border-gray-600'}`} placeholder="e.g. my-project-id" />
                                        <button onClick={fetchProjectId} disabled={isResolvingId} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white disabled:opacity-50">{isResolvingId ? '...' : '↻'}</button>
                                    </div>
                                </div>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Service Name</label><input name="serviceName" type="text" value={a2aConfig.serviceName} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label><input name="displayName" type="text" value={a2aConfig.displayName} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Provider Organization</label><input name="providerOrganization" type="text" value={a2aConfig.providerOrganization} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
                                    <select name="model" value={a2aConfig.model} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                                        <option value="gemini-3-pro-preview">Gemini 3 Pro Preview</option>
                                    </select>
                                </div>
                                <div><label className="block text-sm font-medium text-gray-400 mb-1">Region</label><select name="region" value={a2aConfig.region} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"><option value="us-central1">us-central1</option><option value="europe-west1">europe-west1</option><option value="asia-east1">asia-east1</option></select></div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">System Instruction</label>
                                        <button onClick={() => handleRewrite('instruction')} disabled={rewritingField === 'instruction'} className="text-xs text-blue-400 hover:text-blue-300">{rewritingField === 'instruction' ? '...' : 'AI Rewrite'}</button>
                                    </div>
                                    <textarea name="instruction" value={a2aConfig.instruction} onChange={handleA2aConfigChange} rows={4} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full" />
                                </div>
                                <div className="space-y-2 pt-2 border-t border-gray-600">
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="useGoogleSearch" checked={a2aConfig.useGoogleSearch} onChange={handleA2aConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable Google Search Tool</span></label>
                                </div>
                            </>
                        )}

                        <div className="pt-4 border-t border-gray-700">
                            <h3 className="text-sm font-medium text-gray-300 mb-2">Add Tools</h3>
                            <div className="bg-gray-700/50 p-3 rounded-md space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Vertex AI Search Data Store</label>
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search data stores..."
                                            value={dataStoreSearchTerm}
                                            onChange={(e) => setDataStoreSearchTerm(e.target.value)}
                                            className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                        />
                                        <div className="flex gap-2">
                                            <select 
                                                value={toolBuilderConfig.dataStoreId} 
                                                onChange={(e) => setToolBuilderConfig({...toolBuilderConfig, dataStoreId: e.target.value})}
                                                className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                                                disabled={isLoadingDataStores}
                                            >
                                                <option value="">-- Select Data Store --</option>
                                                {dataStores
                                                    .filter(ds => !dataStoreSearchTerm || ds.displayName.toLowerCase().includes(dataStoreSearchTerm.toLowerCase()) || ds.name.includes(dataStoreSearchTerm))
                                                    .map(ds => {
                                                        const dsId = ds.name.split('/').pop();
                                                        return <option key={ds.name} value={ds.name}>{ds.displayName} ({dsId}) - {ds.location}</option>;
                                                    })
                                                }
                                            </select>
                                            <button 
                                                onClick={() => handleAddTool({ type: 'VertexAiSearchTool', dataStoreId: toolBuilderConfig.dataStoreId, variableName: `search_tool_${(builderTab === 'a2a' ? a2aConfig.tools : adkConfig.tools).length + 1}` })}
                                                disabled={!toolBuilderConfig.dataStoreId}
                                                className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700 disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Call Other Agent (A2A)</label>
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search A2A services..."
                                            value={a2aSearchTerm}
                                            onChange={(e) => setA2aSearchTerm(e.target.value)}
                                            className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                        />
                                        <div className="flex gap-2">
                                            <select 
                                                value={selectedA2aService} 
                                                onChange={(e) => setSelectedA2aService(e.target.value)}
                                                className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                                                disabled={isLoadingServices}
                                            >
                                                <option value="">-- Select A2A Service --</option>
                                                {cloudRunServices
                                                    .filter(s => !a2aSearchTerm || s.name.toLowerCase().includes(a2aSearchTerm.toLowerCase()))
                                                    .map(s => <option key={s.name} value={s.uri}>{s.name.split('/').pop()}</option>)
                                                }
                                            </select>
                                            <button 
                                                onClick={() => handleAddTool({ type: 'A2AClientTool', url: selectedA2aService, variableName: `a2a_agent_${(builderTab === 'a2a' ? a2aConfig.tools : adkConfig.tools).length + 1}` })}
                                                disabled={!selectedA2aService}
                                                className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-3 space-y-2">
                                {(builderTab === 'a2a' ? a2aConfig.tools : adkConfig.tools).map((tool, i) => (
                                    <div key={i} className="flex justify-between items-center bg-gray-900 px-3 py-2 rounded border border-gray-700">
                                        <div className="text-xs text-gray-300">
                                            <span className="font-bold text-teal-400">{tool.type === 'VertexAiSearchTool' ? 'Search' : 'A2A'}</span>: {tool.variableName}
                                        </div>
                                        <button onClick={() => handleRemoveTool(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {builderTab === 'a2a' && (
                            <div className="pt-4 border-t border-gray-700">
                                <h3 className="text-sm font-medium text-gray-300 mb-2">Testing Options</h3>
                                <div className="space-y-2">
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="allowUnauthenticated" checked={a2aConfig.allowUnauthenticated} onChange={handleA2aConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Allow unauthenticated invocations</span></label>
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="enableCors" checked={a2aConfig.enableCors} onChange={handleA2aConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable CORS</span></label>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Code & Deploy (Box 2 & 3) */}
                <div className="flex flex-col gap-6 flex-1 min-h-0">
                    <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-3 shrink-0">2. Generated Source Code</h2>
                        <div className="flex justify-between items-center mb-2 shrink-0">
                            <div className="flex border-b border-gray-700">
                                {(builderTab === 'adk' ? ADK_TABS : A2A_TABS).map(tab => (
                                    <button 
                                        key={tab.id} 
                                        onClick={() => builderTab === 'adk' ? setAdkActiveTab(tab.id as any) : setA2aActiveTab(tab.id as any)} 
                                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                                            (builderTab === 'adk' ? adkActiveTab : a2aActiveTab) === tab.id 
                                            ? 'border-b-2 border-blue-500 text-white' 
                                            : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => handleCopy(builderTab === 'adk' ? adkCodeDisplay : a2aCodeDisplay, builderTab === 'adk' ? setAdkCopySuccess : setA2aCopySuccess)} 
                                className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                            >
                                {(builderTab === 'adk' ? adkCopySuccess : a2aCopySuccess) || 'Copy'}
                            </button>
                        </div>
                        <div className="bg-gray-900 rounded-b-md flex-1 overflow-auto border border-gray-700">
                            <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap"><code>{builderTab === 'adk' ? adkCodeDisplay : a2aCodeDisplay}</code></pre>
                        </div>
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-3 shrink-0">3. Deployment Options</h2>
                        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                            <div className="bg-blue-900/20 p-4 rounded-md border border-blue-800 shrink-0">
                                <h3 className="text-sm font-bold text-blue-300 mb-1">Option A: Cloud Build (Automated)</h3>
                                <button onClick={() => builderTab === 'adk' ? setIsAdkDeployModalOpen(true) : setIsA2aDeployModalOpen(true)} className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 text-white font-bold rounded-md shadow-lg flex items-center justify-center gap-2">Deploy with Cloud Build</button>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700 flex-1 flex flex-col min-h-[150px]">
                                <div className="flex justify-between items-center mb-2 shrink-0">
                                    <h3 className="text-sm font-bold text-gray-200">
                                        {builderTab === 'adk' ? 'Option B: Manual Deployment (README)' : 'Option B: Manual Deployment (CLI Script)'}
                                    </h3>
                                    <div className="flex gap-2">
                                        <button onClick={builderTab === 'adk' ? handleDownloadAdk : handleDownloadA2a} className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500">Download .zip</button>
                                        <button 
                                            onClick={() => handleCopy(builderTab === 'adk' ? adkGeneratedCode.readme : a2aGeneratedCode.gcloud, builderTab === 'adk' ? setAdkCopySuccess : setA2aCopySuccess)} 
                                            className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                                        >
                                            {(builderTab === 'adk' ? adkCopySuccess : a2aCopySuccess) || (builderTab === 'adk' ? 'Copy README' : 'Copy Script')}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-black rounded-md overflow-y-auto flex-1 min-h-0 border border-gray-800">
                                    <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono"><code>{builderTab === 'adk' ? adkGeneratedCode.readme : a2aGeneratedCode.gcloud}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentBuilderPage;
