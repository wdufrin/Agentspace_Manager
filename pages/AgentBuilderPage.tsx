
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
    enableDiscoveryApi: boolean;
    discoveryConfig: DiscoveryConfig;
    enableCloudLogging: boolean;
    enableCloudStorage: boolean;
    enableTelemetry: boolean;
    enableMessageLogging: boolean;
    enableBqAnalytics: boolean;
    bqDatasetId: string;
    bqTableId: string;
    enableThinking: boolean;
    thinkingBudget: number;
    enableStreaming: boolean;

}

interface DiscoveryConfig {
    projectId: string;
    location: string;
    collection: string;
    engineId: string;
    dataStoreIds: string;
}

// --- Tab Definitions ---
const ADK_TABS = [
    { id: 'agent', label: 'agent.py' },
    { id: 'deploy_re', label: 'deploy_re.py' },
    { id: 'env', label: '.env' },
    { id: 'requirements', label: 'requirements.txt' },
    { id: 'readme', label: 'README.md' },
    { id: 'auth_utils', label: 'auth_utils.py' },
    { id: 'tools', label: 'tools.py' }
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

const generateAuthUtils = (): string => {
    return `import os
import logging
from typing import Optional
from google.oauth2.credentials import Credentials
from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)

def get_user_credentials(tool_context: ToolContext) -> Optional[Credentials]:
    """
    Extracts user OAuth2 credentials from the ToolContext state using the configured AUTH_ID.
    
    Args:
        tool_context: The context provided by the ADK runtime.
        
    Returns:
        google.oauth2.credentials.Credentials if token is found, else None.
    """
    # Try to find credentials in context first (injected by Agent Engine)
    auth_id = os.getenv("AUTH_ID", "temp_oauth")
    if auth_id and tool_context.state:
        access_token = tool_context.state.get(auth_id)
        if access_token:
            logger.info(f"Successfully retrieved access token for AUTH_ID: {auth_id}")
            return Credentials(token=access_token)
            
    return None
`;
};

const generateToolsPy = (config: AdkAgentConfig): string => {
    let code = `import os
import logging
import json
import requests
import google.auth
import google.auth.transport.requests
from typing import Optional, Dict, Any, List
from google.adk.tools import ToolContext
from auth_utils import get_user_credentials

logger = logging.getLogger(__name__)
`;

    if (config.enableCloudLogging) {
        code += `
from google.cloud import logging as cloud_logging

def read_recent_logs(tool_context: ToolContext, filter_str: str = "") -> str:
    """
    Reads the last 20 log entries from Cloud Logging.
    
    Args:
        tool_context: The context provided by the ADK runtime.
        filter_str: Optional filter string for the logs.
    """
    try:
        creds = get_user_credentials(tool_context)
        # fallback to default creds if not found (or let library handle it if None)
        client = cloud_logging.Client(credentials=creds, project=os.environ["GOOGLE_CLOUD_PROJECT"])
        
        # Default simple filter if empty
        if not filter_str:
            filter_str = "severity>=WARNING"
            
        entries = client.list_entries(filter_=filter_str, page_size=20, max_results=20, order_by=cloud_logging.DESCENDING)
        
        logs = []
        for entry in entries:
            timestamp = entry.timestamp.isoformat() if entry.timestamp else "N/A"
            payload = str(entry.payload) if entry.payload else "No Payload"
            logs.append(f"[{timestamp}] {entry.severity}: {payload}")
            
        if not logs:
            return "No logs found matching the filter."
            
        return "\\n".join(logs)
    except Exception as e:
        return f"Error reading logs: {e}"
`;
    }

    if (config.enableCloudStorage) {
        code += `
from google.cloud import storage

def list_gcs_buckets(tool_context: ToolContext) -> str:
    """Lists all GCS buckets in the project."""
    try:
        creds = get_user_credentials(tool_context)
        client = storage.Client(credentials=creds, project=os.environ["GOOGLE_CLOUD_PROJECT"])
        buckets = list(client.list_buckets())
        if not buckets:
             return "No buckets found."
        return "\\n".join([b.name for b in buckets])
    except Exception as e:
        return f"Error listing buckets: {e}"

def list_gcs_objects(tool_context: ToolContext, bucket_name: str, prefix: str = "") -> str:
    """Lists objects in a specific GCS bucket."""
    try:
        creds = get_user_credentials(tool_context)
        client = storage.Client(credentials=creds, project=os.environ["GOOGLE_CLOUD_PROJECT"])
        bucket = client.bucket(bucket_name)
        blobs = list(client.list_blobs(bucket, prefix=prefix, max_results=50))
        if not blobs:
            return f"No objects found in {bucket_name} with prefix '{prefix}'."
        return "\\n".join([b.name for b in blobs])
    except Exception as e:
        return f"Error listing objects: {e}"
`;
    }

    if (config.enableDiscoveryApi) {
        code += `
def query_gemini_enterprise(tool_context: ToolContext, query_text: str) -> str:
    """
    Queries the Gemini Enterprise (Discovery Engine) API with the given query text.
    
    Args:
        tool_context: The context provided by the ADK runtime.
        query_text: The question to ask the specialized agent.
        
    Returns:
        The text response from the agent.
    """
    project_id = os.getenv("DISCOVERY_ENGINE_PROJECT_ID")
    location = os.getenv("DISCOVERY_ENGINE_LOCATION", "global")
    collection = os.getenv("DISCOVERY_ENGINE_COLLECTION", "default_collection")
    engine_id = os.getenv("DISCOVERY_ENGINE_ENGINE_ID")
    
    if not all([project_id, engine_id]):
        return "Error: DISCOVERY_ENGINE_PROJECT_ID and DISCOVERY_ENGINE_ENGINE_ID must be set."
    
    url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{project_id}/locations/{location}/collections/{collection}/engines/{engine_id}/assistants/default_assistant:streamAssist"
    
    # Get credentials
    # 1. Try User Credentials from ToolContext (Agent Engine Identity Propagation)
    creds = get_user_credentials(tool_context)
    
    # 2. Fallback to Service Account / ADC
    if not creds:
        logger.info("No user credentials found in context. Falling back to Application Default Credentials.")
        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
        creds, _ = google.auth.default(scopes=scopes)

    # Refresh if needed (for ADC; User creds from context usually are simple tokens but might need refresh if expired and we have refresh token - but simple Credentials wrapping token won't refresh)
    # Actually, Credentials(token=...) is read-only. We rely on valid token.
    if not creds.valid and creds.refresh_token:
        auth_req = google.auth.transport.requests.Request()
        creds.refresh(auth_req)
    
    # If we still don't have a valid token (e.g. user token expired and no refresh), we might fail.
    # But for ADC, it handles refresh.
    
    # For now, just use the token property.
    token = creds.token
    # If creds came from google.auth.default(), we definitely need to ensure it's refreshed.
    if not token:
        # Force refresh for ADC
         auth_req = google.auth.transport.requests.Request()
         creds.refresh(auth_req)
         token = creds.token
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Goog-User-Project": project_id
    }
    
    # Construct the payload
    # Note: The dataStoreSpecs are dynamic based on .env
    data_store_ids = os.getenv("DISCOVERY_ENGINE_DATA_STORE_IDS", "").split(",")
    data_store_specs = [
        {"dataStore": f"projects/{project_id}/locations/{location}/collections/{collection}/dataStores/{ds_id.strip()}"}
        for ds_id in data_store_ids if ds_id.strip()
    ]
    
    payload = {
        "query": {
            "text": query_text
        },
        "toolsSpec": {
            "vertexAiSearchSpec": {
                "dataStoreSpecs": data_store_specs
            }
        }
    }
    
    try:
        logger.info(f"Querying Gemini Enterprise: {query_text}")
        response = requests.post(url, headers=headers, json=payload, stream=True)
        response.raise_for_status()
        
        # Process the response
        try:
            # The API seems to return a pretty-printed JSON array [ ... ]
            # so we can parse the entire response as JSON.
            data = response.json()
            
            # If data is a list, iterate through items
            # If dict, wrap in list
            if isinstance(data, dict):
                 items = [data]
            else:
                 items = data
            
            # DEBUG: Save response to file for inspection
            try:
                with open("debug_response.json", "w") as f:
                    json.dump(items, f, indent=2)
            except Exception as e:
                logger.warning(f"Failed to save debug response: {e}")

            full_response_text = ""
            unique_sources = {} # Map URI to Title to avoid duplicates

            for item in items:
                 # Check for errors
                 if "error" in item:
                      error_msg = item["error"].get("message", str(item["error"]))
                      logger.warning(f"Received error in response item: {error_msg}")
                      full_response_text += f"\\n[Error from upstream: {error_msg}]\\n"
                      continue

                 # 1. Extract Reply / Text
                 # Candidates: item['reply'], item['answer']
                 candidates = []
                 if "reply" in item: candidates.append(item["reply"])
                 if "answer" in item: candidates.append(item["answer"])
                 
                 for container in candidates:
                      if not isinstance(container, dict):
                           continue

                      # Case A: 'parts' directly in container (Standard Gemini)
                      if "parts" in container:
                           for part in container["parts"]:
                                if "text" in part:
                                     full_response_text += part["text"]
                      
                      # Case B: 'planStep' (Agent Engine)
                      if "planStep" in container and "parts" in container["planStep"]:
                           for part in container["planStep"]["parts"]:
                                if "text" in part:
                                     full_response_text += part["text"]

                      # Case C: 'replies' list (Discovery Engine Answer API)
                      if "replies" in container:
                           for reply_item in container["replies"]:
                                # reply_item['groundedContent']['content']['text']
                                content = reply_item.get("groundedContent", {}).get("content", {})
                                if "text" in content:
                                     full_response_text += content["text"]

                                # Check for citations in reply item ? (Unknown, but safe to check)
                                if "citations" in reply_item:
                                     for citation in reply_item["citations"]:
                                          for source in citation.get("sources", []):
                                               uri = source.get("uri")
                                               title = source.get("title")
                                               if uri:
                                                    unique_sources[uri] = title or uri

                 # Check for citations at root level
                 if "citations" in item:
                     for citation in item["citations"]:
                         for source in citation.get("sources", []):
                             uri = source.get("uri")
                             title = source.get("title")
                             if uri:
                                 unique_sources[uri] = title or uri

            # Format the final output with sources

            # Format the final output with sources
            final_output = full_response_text.strip()

            if unique_sources:
                 final_output += "\\n\\n**Available Sources:**\\n"
                 for uri, title in unique_sources.items():
                      final_output += f"- [{title}]({uri})\\n"

            return final_output

        except json.JSONDecodeError:
             # Fallback to raw text if JSON fails (e.g. maybe it was truly streaming text?)
             logger.warning("Failed to parse response as JSON. Returning raw text.")
             return f"Raw response:\\n{response.text}"

    except Exception as e:
        logger.error(f"Error querying Gemini Enterprise: {e}")
        return f"Error: {str(e)}"
`;
    }

    if (config.tools.some(t => t.type === 'A2AClientTool')) {
        code += `
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

    return code;
};

const generateAdkPythonCode = (config: AdkAgentConfig): string => {
    const toolImports = new Set<string>();
    const toolInitializations: string[] = [];
    const toolListForAgent: string[] = [];
    const pluginsImports = new Set<string>();
    const pluginInitializations: string[] = [];
    const pluginList: string[] = [];

    // We import from tools now
    const toolsImport = new Set<string>();

    // Model selection logic
    const modelName = config.model;
    const agentClass = 'Agent';
    const agentImport = 'from google.adk.agents import Agent';
    const adkAppImport = 'from google.adk.apps import App';

    toolImports.add('import google.auth');


    // Inject A2A Helper Function Import
    if (config.tools.some(t => t.type === 'A2AClientTool')) {
        toolsImport.add('create_a2a_tool');
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

    if (config.enableDiscoveryApi) {
        toolsImport.add('query_gemini_enterprise');
        toolListForAgent.push('query_gemini_enterprise');
    }

    if (config.enableCloudLogging) {
        toolsImport.add('read_recent_logs');
        toolListForAgent.push('read_recent_logs');
    }

    if (config.enableCloudStorage) {
        toolsImport.add('list_gcs_buckets');
        toolsImport.add('list_gcs_objects');
        toolListForAgent.push('list_gcs_buckets');
        toolListForAgent.push('list_gcs_objects');
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
        'from dotenv import load_dotenv',
        agentImport,
        'from vertexai.preview import reasoning_engines',
        config.enableThinking ? 'from google.adk.planners import BuiltInPlanner' : '',
        config.enableThinking ? 'from google.genai import types as genai_types' : '',
        ...Array.from(toolImports),
        ...Array.from(pluginsImports),
    ].filter(Boolean);

    if (toolsImport.size > 0) {
        imports.push(`from tools import ${Array.from(toolsImport).join(', ')}`);
    }

    const hasPlugins = pluginList.length > 0;
    if (hasPlugins) {
        imports.push(adkAppImport);
    }

    return `
${imports.join('\n')}

load_dotenv()

# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join('\n\n') : '# No additional tools defined'}

# Initialize Plugins
${pluginInitializations.length > 0 ? pluginInitializations.join('\n\n') : '# No plugins defined'}

${config.enableThinking ? `
# Define Thinking Planner
thinking_planner = BuiltInPlanner(
    thinking_config=genai_types.ThinkingConfig(
        include_thoughts=True,
        thinking_budget=${config.thinkingBudget},
    )
)
` : ''}

# Define the root agent
root_agent = ${agentClass}(
    name=${formatPythonString(config.name)},
    description=${formatPythonString(config.description)},
    model=os.getenv("MODEL", ${formatPythonString(modelName)}),
    instruction=${formatPythonString(config.instruction)},
    tools=[${toolListForAgent.join(', ')}],
    ${config.enableThinking ? 'planner=thinking_planner,' : ''}
)

${hasPlugins ? `
# Define the ADK App with plugins
adk_app = App(
    name=${formatPythonString(config.name)},
    root_agent=root_agent,
    plugins=[${pluginList.join(', ')}],
)
` : ''}

${config.enableStreaming ? `
# Streaming Wrapper
from typing import Generator

class StreamingAgentWrapper:
    def __init__(self, agent):
        self.agent = agent

    def query(self, input: str, **kwargs) -> Generator[str, None, None]:
        # Use the underlying model's start_chat and send_message with stream=True
        # This bypasses the agent's query/run method to force streaming from the model
        # Note: This is a simplification. For full agent features like tool use + streaming, 
        # one would typically need a streaming-compatible runner or updated Agent class.
        # This wrapper assumes direct model interaction for streaming as a fallback.
        
        # If the agent has a model with start_chat, use it.
        if hasattr(self.agent, 'model') and hasattr(self.agent.model, 'start_chat'):
            chat = self.agent.model.start_chat()
            response_stream = chat.send_message(input, stream=True, **kwargs)
            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
        else:
            # Fallback to non-streaming if model doesn't support it easily
            yield self.agent.query(input, **kwargs)

    def __getattr__(self, name):
        return getattr(self.agent, name)
` : ''}

# Define the App for Vertex AI Agent Engine
# Note: Root agent is wrapped in AdkApp as requested.
# If streaming is enabled, wrap the agent.
# Note: AdkApp expects 'agent' to have a 'query' method.
final_agent = ${config.enableStreaming ? 'StreamingAgentWrapper(root_agent)' : 'root_agent'}
${hasPlugins ? 'final_agent = adk_app' : ''} # Plugins take precedence if wrapping agent, but typically plug-ins wrap root_agent inside AdkApp logic.
# Actually AdkApp takes 'agent'. If we use plugins, 'adk_app' IS the app. 
# But 'reasoning_engines.AdkApp' wraps an agent. 
# If we have plugins, 'adk_app' is an instance of 'google.adk.apps.App'.
# Reasoning Engine's AdkApp expects a 'google.adk.agents.Agent' or compatible.

app = reasoning_engines.AdkApp(
    agent=${hasPlugins ? 'adk_app' : 'final_agent'},
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
reqs = ["google-cloud-aiplatform[adk,agent_engines]>=1.75.0", "google-adk>=0.1.0", "python-dotenv"]
if os.path.exists("requirements.txt"):
    with open("requirements.txt", "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                reqs.append(line)
reqs = list(set(reqs))

# Parse .env for deploymentSpec
env_vars = []
if os.path.exists(".env"):
    try:
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip()
                    if not key:
                        continue

                    # Handle quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]

                    # Update os.environ so the SDK can pick it up
                    os.environ[key] = value

                    # Append strictly non-reserved keys to env_vars list for deployment
                    if (key not in ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "STAGING_BUCKET", "PROJECT_ID"]
                        and not key.startswith("OTEL_")
                        and not key.startswith("GOOGLE_CLOUD_AGENT_ENGINE_")):
                        env_vars.append(key)

        # Deduplicate env_vars to prevent "EnvVar names must be unique" error
        env_vars = list(set(env_vars))
        logger.info(f"Final deployment env_vars: {env_vars}")
        logger.info(f"Parsed {len(env_vars)} environment variables for deploymentSpec.")
    except Exception as e:
        logger.warning(f"Failed to parse .env file: {e}")

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

logger.info("Creating Agent Engine...")

# Detect extra packages (like auth_utils.py)
extra_packages = []
for f in os.listdir("."):
    if f in ["deploy_re.py", ".env", "requirements.txt", ".git", ".adk", "venv", ".venv", "__pycache__", "node_modules"]:
        continue

    if os.path.isfile(f) and f.endswith(".py"):
            extra_packages.append(f)
    elif os.path.isdir(f) and not f.startswith("."):
            extra_packages.append(f)

logger.info(f"Extra packages detected: {extra_packages}")

remote_app = reasoning_engines.ReasoningEngine.create(
    app_to_deploy,
    requirements=reqs,
    env_vars=env_vars,
    extra_packages=extra_packages,
    display_name=os.getenv("AGENT_DISPLAY_NAME", "${config.name || 'my-agent'}"),
)

print(f"Deployment finished!")
print(f"Resource Name: {remote_app.resource_name}")
`.trim();
};

const generateAdkEnvFile = (config: AdkAgentConfig, projectNumber: string, location: string, stagingBucket: string): string => {
    let content = `GOOGLE_GENAI_USE_VERTEXAI=TRUE
MODEL="${config.model}"
GOOGLE_CLOUD_PROJECT="${projectNumber}"
GOOGLE_CLOUD_LOCATION="${location}"
STAGING_BUCKET="${stagingBucket || 'gs://YOUR_BUCKET_NAME'}"
AGENT_DISPLAY_NAME="${config.name}"`;

    if (config.enableOAuth && config.authId) {
        content += `\nAUTH_ID="${config.authId}"`;
    }
    

    

    if (config.enableDiscoveryApi) {
        content += `
DISCOVERY_ENGINE_PROJECT_ID="${config.discoveryConfig.projectId}"
DISCOVERY_ENGINE_LOCATION="${config.discoveryConfig.location}"
DISCOVERY_ENGINE_COLLECTION="${config.discoveryConfig.collection}"
DISCOVERY_ENGINE_ENGINE_ID="${config.discoveryConfig.engineId}"
DISCOVERY_ENGINE_DATA_STORE_IDS="${config.discoveryConfig.dataStoreIds}"`;
    }

    if (config.enableTelemetry) {
        content += `\nGOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true`;
    }
    if (config.enableMessageLogging) {
        content += `\nOTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`;
    }

    return content.trim();
};

const generateAdkRequirementsFile = (config: AdkAgentConfig): string => {
    const requirements = new Set([
        'google-cloud-aiplatform[adk,agent_engines]>=1.75.0', 
        'python-dotenv',
        'google-adk>=0.1.0'
    ]);
    if (config.enableOAuth || config.tools.some(t => t.type === 'A2AClientTool')) {
        requirements.add('google-auth-oauthlib>=1.2.2');
        requirements.add('google-api-python-client');
        requirements.add('google-auth');
    }

    if (config.tools.some(t => t.type === 'A2AClientTool') || config.enableDiscoveryApi) {
        requirements.add('requests');
    }

    if (config.enableCloudLogging) {
        requirements.add('google-cloud-logging');
    }
    if (config.enableCloudStorage) {
        requirements.add('google-cloud-storage');
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


interface AgentTemplate {
    id: string;
    name: string;
    description: string;
    config: Partial<AdkAgentConfig>;
}

const GCP_LOGS_READER_TEMPLATE: AgentTemplate = {
    id: 'gcp_logs_reader',
    name: 'GCP Logs Reader',
    description: 'An agent that can search Google Cloud Logs, with OAuth and Telemetry enabled.',
    config: {
        name: 'GCP_Logs_Reader',
        description: 'An expert agent for analyzing Google Cloud Logs.',
        model: 'gemini-2.5-flash',
        instruction: 'You are a Google Cloud Logging expert. Your goal is to help users find and analyze logs from their GCP projects. You have access to tools for reading logs and searching Google. Always verify the project ID before querying.',
        useGoogleSearch: true,
        enableOAuth: true,
        authId: 'default',
        enableCloudLogging: true,
        enableTelemetry: true,
        enableMessageLogging: true,
        tools: []
    }
};

const TEMPLATES: AgentTemplate[] = [
    GCP_LOGS_READER_TEMPLATE
];

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
        enableDiscoveryApi: false,
        discoveryConfig: {
            projectId: '',
            location: 'global',
            collection: 'default_collection',
            engineId: '',
            dataStoreIds: ''
        },
        enableCloudLogging: false,
        enableCloudStorage: false,
        enableTelemetry: false,
        enableMessageLogging: false,
        enableBqAnalytics: false,
        bqDatasetId: '',
        bqTableId: '',
        enableThinking: false,
        thinkingBudget: 1024,
        enableStreaming: false
    });
    const [vertexLocation, setVertexLocation] = useState('us-central1');
    const [adkGeneratedCode, setAdkGeneratedCode] = useState({ agent: '', env: '', requirements: '', readme: '', deploy_re: '', auth_utils: '', tools: '' });
    const [adkActiveTab, setAdkActiveTab] = useState<'agent' | 'env' | 'requirements' | 'readme' | 'deploy_re' | 'auth_utils' | 'tools'>('agent');
    const [adkCopySuccess, setAdkCopySuccess] = useState('');

    // Discovery Engine State
    const [collections, setCollections] = useState<any[]>([]);
    const [engines, setEngines] = useState<any[]>([]);
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);

    // Fetch Collections when project/location changes
    useEffect(() => {
        if (!adkConfig.enableDiscoveryApi || !adkConfig.discoveryConfig.projectId && !projectNumber) return;
        if (!adkConfig.discoveryConfig.location) return;

        const fetchCollections = async () => {
            setIsDiscoveryLoading(true);
            try {
                const targetProject = adkConfig.discoveryConfig.projectId || projectNumber;
                const tempConfig: any = {
                    projectId: targetProject,
                    appLocation: adkConfig.discoveryConfig.location
                };

                const res = await api.listResources('collections', tempConfig);
                setCollections(res.collections || []);
            } catch (e) {
                console.error("Failed to fetch collections", e);
            } finally {
                setIsDiscoveryLoading(false);
            }
        };
        fetchCollections();
    }, [adkConfig.enableDiscoveryApi, adkConfig.discoveryConfig.projectId, adkConfig.discoveryConfig.location, projectNumber]);

    // Fetch Engines when Collection changes
    useEffect(() => {
        if (!adkConfig.enableDiscoveryApi || !adkConfig.discoveryConfig.collection) return;

        const fetchEngines = async () => {
            setIsDiscoveryLoading(true);
            try {
                const targetProject = adkConfig.discoveryConfig.projectId || projectNumber;
                const tempConfig: any = {
                    projectId: targetProject,
                    appLocation: adkConfig.discoveryConfig.location,
                    collectionId: adkConfig.discoveryConfig.collection
                };
                const res = await api.listResources('engines', tempConfig);
                setEngines(res.engines || []);
            } catch (e) {
                console.error("Failed to fetch engines", e);
            } finally {
                setIsDiscoveryLoading(false);
            }
        };
        fetchEngines();
    }, [adkConfig.enableDiscoveryApi, adkConfig.discoveryConfig.collection, adkConfig.discoveryConfig.projectId, adkConfig.discoveryConfig.location, projectNumber]);

    // Data Store Tool State
    const [toolBuilderConfig, setToolBuilderConfig] = useState({ dataStoreId: '' });
    const [dataStores, setDataStores] = useState<(DataStore & { location: string })[]>([]);
    const [isLoadingDataStores, setIsLoadingDataStores] = useState(false);
    const [dataStoreSearchTerm, setDataStoreSearchTerm] = useState('');

    // Staging Bucket State
    const [stagingBucket, setStagingBucket] = useState('');
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

    // A2A Tool State
    const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [selectedA2aService, setSelectedA2aService] = useState('');
    const [a2aSearchTerm, setA2aSearchTerm] = useState('');

    const [isAdkDeployModalOpen, setIsAdkDeployModalOpen] = useState(false);
    const [rewritingField, setRewritingField] = useState<string | null>(null);


    
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
        const envCode = generateAdkEnvFile(adkConfig, projectNumber, vertexLocation, stagingBucket);
        const reqsCode = generateAdkRequirementsFile(adkConfig);
        const readmeCode = generateAdkReadmeFile(adkConfig);
        const deployCode = generateAdkDeployScript(adkConfig);
        const authUtilsCode = generateAuthUtils();
        const toolsCode = generateToolsPy(adkConfig);
        setAdkGeneratedCode({ agent: agentCode, env: envCode, requirements: reqsCode, readme: readmeCode, deploy_re: deployCode, auth_utils: authUtilsCode, tools: toolsCode });
    }, [adkConfig, projectNumber, vertexLocation, stagingBucket]);

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

          // Fetch Buckets
          setIsLoadingBuckets(true);
          try {
              // We need to resolve the project string first if currently a number, 
              // but here we just try api.listBuckets which likely expects an ID string or number.
              // If projectNumber is actually a number, listBuckets usually works if valid.
              // Best effort:
              const b = await api.listBuckets(projectNumber);
              const items = b.items || [];
              setBuckets(items);
              if (items.length > 0 && !stagingBucket) {
                  setStagingBucket(`gs://${items[0].name}`);
              }
          } catch (e) {
              console.error("Failed to fetch buckets", e);
          } finally {
              setIsLoadingBuckets(false);
          }
      };
      
      fetchData();
    }, [projectNumber]);




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
        if (name.startsWith('discovery.')) {
            const field = name.split('.')[1];
            setAdkConfig(prev => ({
                ...prev,
                discoveryConfig: {
                    ...prev.discoveryConfig,
                    [field]: value
                }
            }));
        } else if (type === 'checkbox') {
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
        if (adkConfig.enableOAuth) {
            zip.file('auth_utils.py', adkGeneratedCode.auth_utils);
        }
        zip.file('tools.py', adkGeneratedCode.tools);
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
        deploy_re: adkGeneratedCode.deploy_re,
        auth_utils: adkGeneratedCode.auth_utils,
        tools: adkGeneratedCode.tools
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
        { name: 'deploy_re.py', content: adkGeneratedCode.deploy_re },
        { name: 'tools.py', content: adkGeneratedCode.tools }
    ];

    if (adkConfig.enableOAuth) {
        adkFilesForBuild.push({ name: 'auth_utils.py', content: adkGeneratedCode.auth_utils });
    }

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
            <AgentDeploymentModal isOpen={isAdkDeployModalOpen} onClose={() => setIsAdkDeployModalOpen(false)} agentName={adkConfig.name || 'my-agent'} files={adkFilesForBuild} projectNumber={projectNumber} onBuildTriggered={handleBuildTriggered} initialBucket={stagingBucket ? stagingBucket.replace('gs://', '') : undefined} />
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
                                {/* Templates Selection */}
                                <div className="mb-4 p-3 bg-gray-750 rounded-lg border border-gray-600">
                                    <label className="block text-sm font-medium text-blue-400 mb-2">🚀 Quick Start Templates</label>
                                    <select
                                        onChange={(e) => {
                                            const template = TEMPLATES.find(t => t.id === e.target.value);
                                            if (template) {
                                                setAdkConfig(prev => ({
                                                    ...prev,
                                                    ...template.config,
                                                    // Preserve specific fields we don't want to overwrite blindly if they have values?
                                                    // For now, template overwrites defaults.
                                                    discoveryConfig: {
                                                        ...prev.discoveryConfig,
                                                        ...(template.config.discoveryConfig || {})
                                                    }
                                                }));
                                            }
                                        }}
                                        className="bg-gray-800 border border-gray-500 rounded-md px-3 py-2 text-sm text-white w-full hover:border-blue-500 focus:border-blue-500 transition-colors"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Select a template to auto-fill...</option>
                                        {TEMPLATES.map(t => (
                                            <option key={t.id} value={t.id}>{t.name} - {t.description}</option>
                                        ))}
                                    </select>
                                </div>

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

                                {/* Staging Bucket - Moved here for ADK */}
                                <div className="mt-2">
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Staging Bucket</label>
                                    <div className="flex gap-2">
                                        <select
                                            value={stagingBucket}
                                            onChange={(e) => setStagingBucket(e.target.value)}
                                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-teal-500 focus:border-teal-500"
                                        >
                                            <option value="">-- Select Bucket --</option>
                                            {buckets.map(b => (
                                                <option key={b.name} value={`gs://${b.name}`}>gs://{b.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => {
                                                setIsLoadingBuckets(true);
                                                api.listBuckets(projectNumber).then(res => {
                                                    setBuckets(res.items || []);
                                                    setIsLoadingBuckets(false);
                                                });
                                            }}
                                            disabled={isLoadingBuckets}
                                            className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50"
                                            title="Refresh Buckets"
                                        >
                                            &#x21bb;
                                        </button>
                                    </div>
                                    {!stagingBucket && <p className="text-xs text-yellow-500 mt-1">Required for deployment.</p>}
                                </div>
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-400">Instruction</label>
                                        <button onClick={() => handleRewrite('instruction')} disabled={rewritingField === 'instruction'} className="text-xs text-blue-400 hover:text-blue-300">{rewritingField === 'instruction' ? '...' : 'AI Rewrite'}</button>
                                    </div>


                                    <textarea name="instruction" value={adkConfig.instruction} onChange={handleAdkConfigChange} rows={4} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full mt-2" />
                                </div>
                                <div className="space-y-2 pt-2 border-t border-gray-600">
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="useGoogleSearch" checked={adkConfig.useGoogleSearch} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable Google Search Tool</span></label>
                                    <label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="enableOAuth" checked={adkConfig.enableOAuth} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Enable OAuth (For Reference)</span></label>
                                    {adkConfig.enableOAuth && (
                                        <div className="pl-7 space-y-2">
                                            <input type="text" name="authId" value={adkConfig.authId} onChange={handleAdkConfigChange} placeholder="Authorization Resource ID" className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full" />


                                            <label className="flex items-center space-x-3 cursor-pointer mt-2">
                                                <input type="checkbox" name="enableDiscoveryApi" checked={adkConfig.enableDiscoveryApi} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" disabled />
                                                <span className="text-sm text-gray-500 line-through">Enable Discovery Engine API (Disabled)</span>
                                            </label>

                                        </div>
                                    )}

                                            <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                                        <h4 className="text-xs font-semibold text-gray-400">Agent Capabilities</h4>
                                        <div className="flex items-center space-x-2">
                                            <label className="flex items-center space-x-3 cursor-pointer">
                                                <input type="checkbox" name="enableThinking" checked={adkConfig.enableThinking} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" />
                                                <span className="text-sm text-gray-300">Enable Thinking Details</span>
                                            </label>
                                            {adkConfig.enableThinking && (
                                                <div className="flex flex-col">
                                                    <input
                                                        type="number"
                                                        name="thinkingBudget"
                                                        value={adkConfig.thinkingBudget}
                                                        onChange={handleAdkConfigChange}
                                                        placeholder="Limit (-1)"
                                                        title="Token limit for thinking process (-1 for unlimited)"
                                                        className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-24"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                                <label className="flex items-center space-x-3 cursor-pointer">
                                            <input type="checkbox" name="enableStreaming" checked={adkConfig.enableStreaming} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" />
                                            <span className="text-sm text-gray-300">Enable Streaming Responses</span>
                                                </label>
                                            </div>

                                            <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                                                <h4 className="text-xs font-semibold text-gray-400">Observability</h4>
                                                <label className="flex items-center space-x-3 cursor-pointer" title="Populates the agent observability dashboard and traces pages.">
                                                    <input type="checkbox" name="enableTelemetry" checked={adkConfig.enableTelemetry} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" />
                                                    <span className="text-sm text-gray-300">Enable OpenTelemetry Traces & Logs</span>
                                                </label>
                                                <label className="flex items-center space-x-3 cursor-pointer" title="Enabling this will collect and store the full content of user prompts and responses. Ensure you have necessary user consents.">
                                                    <input type="checkbox" name="enableMessageLogging" checked={adkConfig.enableMessageLogging} onChange={handleAdkConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" />
                                                    <span className="text-sm text-gray-300">Log Prompts & Responses (Sensitive)</span>
                                                </label>
                                            </div>


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
                                {(builderTab === 'adk' ? ADK_TABS.filter(t => t.id !== 'auth_utils' || adkConfig.enableOAuth) : A2A_TABS).map(tab => (
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



                            {/* Location */}
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
