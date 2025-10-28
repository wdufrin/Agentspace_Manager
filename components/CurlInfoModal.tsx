
import React, { useState } from 'react';
import { Page } from '../types';

interface CurlInfoModalProps {
  page: Page;
  onClose: () => void;
}

const PAGE_INFO: { [key in Page]?: { description: string; commands: { title: string; command: string }[] } } = {
    [Page.AGENTS]: {
        description: "These are the underlying REST API calls for managing agents. They interact with the v1alpha Discovery Engine API.",
        commands: [
            {
                title: 'List Agents',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"`
            },
            {
                title: 'Create an ADK Agent',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "My API Agent",
        "adkAgentDefinition": {
          "tool_settings": { "tool_description": "A tool that can call APIs." },
          "provisioned_reasoning_engine": {
            "reasoning_engine": "projects/[YOUR_PROJECT_ID]/locations/[RE_LOCATION]/reasoningEngines/[RE_ID]"
          }
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents?agentId=[OPTIONAL_AGENT_ID]"`
            },
            {
                title: 'Enable Agent',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{}' \\
  "https://discoveryengine.googleapis.com/v1alpha/[AGENT_RESOURCE_NAME]:enableAgent"`
            },
        ]
    },
    [Page.AUTHORIZATIONS]: {
        description: "These are the underlying REST API calls for managing OAuth authorizations.",
        commands: [
            {
                title: 'List Authorizations',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations"`
            },
            {
                title: 'Create an Authorization',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "serverSideOauth2": {
          "clientId": "[YOUR_OAUTH_CLIENT_ID]",
          "clientSecret": "[YOUR_OAUTH_CLIENT_SECRET]",
          "authorizationUri": "https://accounts.google.com/o/oauth2/auth?...",
          "tokenUri": "https://oauth2.googleapis.com/token"
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations?authorizationId=[NEW_AUTH_ID]"`
            }
        ]
    },
    [Page.AGENT_ENGINES]: {
        description: "These are the underlying REST API calls for managing Vertex AI Reasoning Engines.",
        commands: [
            {
                title: 'List Reasoning Engines',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"`
            },
            {
                title: 'Direct Query (Streaming)',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "input": {
          "message": "What is the capital of France?",
          "user_id": "[UNIQUE_SESSION_ID]"
        }
      }' \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/[ENGINE_RESOURCE_NAME]:streamQuery"`
            }
        ]
    },
    [Page.DATA_STORES]: {
        description: "These are the underlying REST API calls for exploring Vertex AI Search data stores.",
        commands: [
            {
                title: 'List Data Stores',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores"`
            },
            {
                title: 'List Documents',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores/[DATASTORE_ID]/branches/0/documents"`
            }
        ]
    },
    [Page.MODEL_ARMOR]: {
        description: "This feature fetches safety policy violation logs from the Cloud Logging API.",
        commands: [
            {
                title: 'List Violation Logs',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{
        "projectIds": ["[YOUR_PROJECT_ID]"],
        "filter": "log_id(\\"modelarmor.googleapis.com/sanitize_operations\\")",
        "orderBy": "timestamp desc",
        "pageSize": 50
      }' \\
  "https://logging.googleapis.com/v2/entries:list"`
            }
        ]
    },
    [Page.CHAT]: {
        description: "This feature sends a prompt to an agent and receives a streaming response.",
        commands: [
            {
                title: 'Chat with an Agent (Streaming)',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "query": { "text": "Hello, what can you do?" },
        "agentsConfig": {
          "agent": "projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]"
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]:streamAssist"`
            }
        ]
    },
    [Page.AGENT_BUILDER]: {
        description: "The deploy step in the Agent Builder creates a new Reasoning Engine with a deployed ADK agent package from GCS.",
        commands: [
            {
                title: 'Deploy to a New Reasoning Engine',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "My New Deployed Agent",
        "spec": {
          "agentFramework": "google-adk",
          "packageSpec": {
            "pickleObjectGcsUri": "gs://[BUCKET_NAME]/[PATH]/agent.pkl",
            "requirementsGcsUri": "gs://[BUCKET_NAME]/[PATH]/requirements.txt",
            "pythonVersion": "3.10"
          }
        }
      }' \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"`
            }
        ]
    },
    [Page.AGENT_REGISTRATION]: {
        description: "This feature registers a new agent resource from a deployed Cloud Run function by providing its 'agent card' JSON.",
        commands: [
            {
                title: 'Register an A2A Agent',
                command: `# The 'jsonAgentCard' is a stringified JSON object.
curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "My A2A Agent",
        "description": "An agent that provides weather information.",
        "a2aAgentDefinition": {
          "jsonAgentCard": "{\\"provider\\":{\\"organization\\":\\"My Company\\",\\"url\\":\\"https://my-a2a-function-....run.app\\"},\\"name\\":\\"My A2A Agent\\", ...}"
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[...]/agents?agentId=my-weather-agent"`
            }
        ]
    },
    [Page.A2A_TESTER]: {
        description: "This feature fetches the `agent.json` discovery file from a deployed A2A function. This requires an Identity Token, not an Access Token.",
        commands: [
            {
                title: 'Test an A2A Agent (Discovery)',
                command: `# Generate the Identity Token and make the request in one command
curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audience https://[YOUR_SERVICE_URL].run.app)" \\
  "https://[YOUR_SERVICE_URL].run.app/.well-known/agent.json"`
            }
        ]
    },
    [Page.MCP_SERVERS]: {
        description: "This page scans for Cloud Run services in a specified region to identify potential MCP servers.",
        commands: [
            {
                title: 'List Cloud Run Services',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"`
            }
        ]
    },
    [Page.BACKUP_RECOVERY]: {
        description: "The Backup & Restore feature orchestrates a series of `list` and `create` calls to save and rebuild resources. The API calls are specific to the resources being backed up (e.g., Agents, Data Stores).",
        commands: []
    },
    [Page.ARCHITECTURE]: {
        description: "The Architecture Visualizer performs a comprehensive scan across multiple regions and resource types to discover and map your Gemini Enterprise resources. It uses a series of `list` API calls similar to those shown on other pages.",
        commands: []
    },
    [Page.A2A_FUNCTIONS]: {
        description: "The A2A Function Builder generates source code and deployment scripts. It does not directly make API calls itself, but the generated scripts use `gcloud` to deploy to Cloud Run.",
        commands: []
    },
};

const CodeBlock: React.FC<{ title: string, command: string }> = ({ title, command }) => {
  const [copyText, setCopyText] = useState('Copy');
  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopyText('Copied!');
    setTimeout(() => setCopyText('Copy'), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-gray-900/50">
        <span className="text-sm font-semibold text-gray-300">{title}</span>
        <button onClick={handleCopy} className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500">{copyText}</button>
      </div>
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
        <code>{command}</code>
      </pre>
    </div>
  );
};

const CurlInfoModal: React.FC<CurlInfoModalProps> = ({ page, onClose }) => {
  const info = PAGE_INFO[page];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">API Commands for {page}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>
        <main className="p-6 overflow-y-auto space-y-4">
          {info ? (
            <>
              <p className="text-sm text-gray-400">{info.description}</p>
              {info.commands.length > 0 && <p className="text-xs text-gray-500">Note: Replace placeholders like <code>[YOUR_PROJECT_ID]</code> and <code>[YOUR_ACCESS_TOKEN]</code> with your actual values.</p>}
              {info.commands.map(cmd => (
                <CodeBlock key={cmd.title} title={cmd.title} command={cmd.command} />
              ))}
            </>
          ) : (
            <p className="text-gray-400">No specific API command examples are available for this page.</p>
          )}
        </main>
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default CurlInfoModal;
