
import React, { useState } from 'react';
import { Page } from '../types';

interface CurlInfoModalProps {
  infoKey: string;
  onClose: () => void;
}

const ALL_INFO: { [key: string]: { description: string; commands: { title: string; command: string }[] } } = {
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
        ]
    },
    [Page.ASSISTANT]: {
        description: "These are the underlying REST API calls for managing the default assistant associated with a Gemini Enterprise Engine.",
        commands: [
            {
                title: 'Get Assistant Details',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/default_assistant"`
            },
            {
                title: 'Update Assistant',
                command: `curl -X PATCH \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "New Assistant Name",
        "generationConfig": {
            "systemInstruction": {
                "additionalSystemInstruction": "You are a helpful and funny assistant."
            }
        }
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/default_assistant?updateMask=display_name,generation_config.system_instruction.additional_system_instruction"`
            }
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
        ]
    },
    [Page.CHAT]: {
        description: "This is the underlying REST API call for testing a Gemini Enterprise (G.E.) assistant. It sends a prompt and receives a streaming response.",
        commands: [
            {
                title: 'Test Assistant (Streaming)',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "query": { "text": "Hello, what can you do?" }
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]:streamAssist"`
            },
        ]
    },
    'Backup:DiscoveryResources': {
        description: "A full discovery resource backup involves recursively listing all collections, engines, assistants, and agents. The primary starting point is listing collections.",
        commands: [{ title: 'List Collections (Primary Step)', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections"` }]
    },
    'Restore:DiscoveryResources': {
        description: "Restoring discovery resources involves a series of `create` operations. The first step is to create the collection.",
        commands: [{ title: 'Create Collection (First Step)', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[COLLECTION_DISPLAY_NAME]"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections?collectionId=[COLLECTION_ID]"` }]
    },
    'Backup:AppEngine': {
        description: "Backing up a single App/Engine involves getting its details and then listing its assistants and agents recursively.",
        commands: [{ title: 'Get Engine Details', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]"` }]
    },
    'Restore:AppEngine': {
        description: "Restoring an App/Engine requires creating a data store for it first, then creating the engine itself.",
        commands: [{ title: 'Create Engine', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[ENGINE_DISPLAY_NAME]", "solutionType": "SOLUTION_TYPE_SEARCH", "dataStoreIds": ["[NEW_DATA_STORE_ID]"]}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines?engineId=[ENGINE_ID]"` }]
    },
    'Backup:Assistant': {
        description: "Backing up a single Assistant involves getting its details and then listing its agents.",
        commands: [{ title: 'Get Assistant Details', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]"` }]
    },
    'Restore:Assistant': {
        description: "Restoring an Assistant involves creating it within a target App/Engine.",
        commands: [{ title: 'Create Assistant', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[ASSISTANT_DISPLAY_NAME]"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants?assistantId=[ASSISTANT_ID]"` }]
    },
    'Backup:Agents': {
        description: "Backing up agents involves listing all agents within a specific assistant.",
        commands: [{ title: 'List Agents', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"` }]
    },
    'Restore:Agents': {
        description: "Restoring agents involves creating them within a target assistant. The `createAgent` call from the main Agents page is used.",
        commands: [{ title: 'Create Agent', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{...}' "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"` }]
    },
    'Backup:DataStores': {
        description: "Backing up data stores involves listing all data stores within a specific collection.",
        commands: [{ title: 'List Data Stores', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores"` }]
    },
    'Restore:DataStores': {
        description: "Restoring a data store involves creating it within a target collection.",
        commands: [{ title: 'Create Data Store', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[DS_DISPLAY_NAME]", "industryVertical": "GENERIC", "solutionTypes": ["SOLUTION_TYPE_SEARCH"], "contentConfig": "NO_CONTENT"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores?dataStoreId=[DATA_STORE_ID]"` }]
    },
    'Backup:Authorizations': {
        description: "Backing up authorizations involves listing all authorizations in the project.",
        commands: [{ title: 'List Authorizations', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/global/authorizations"` }]
    },
    'Restore:Authorizations': {
        description: "Restoring an authorization involves creating it. The `createAuthorization` call from the Authorizations page is used. Note that you must provide the client secret, which is not included in the backup file.",
        commands: [{ title: 'Create Authorization', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{ "serverSideOauth2": { ... } }' "https://discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/global/authorizations?authorizationId=[AUTH_ID]"` }]
    },
    'ArchitectureScan': {
        description: "The architecture scan performs a series of 'list' operations across multiple regions and resource types to discover all connected components. It starts by listing global resources like Authorizations, then scans all regions for Reasoning Engines, and finally explores Discovery Engine locations to find Engines, Assistants, and Agents recursively.",
        commands: [
            {
                title: 'List Authorizations (Global)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations"`
            },
            {
                title: 'List Reasoning Engines (Per-Region)',
                command: `# The scan iterates over locations like us-central1, europe-west1, etc.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"`
            },
            {
                title: 'List Discovery Engines (Per-Location)',
                command: `# The scan iterates over discovery locations like global, us, eu.
# Then it recursively lists assistants and agents found within each engine.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines"`
            },
            {
                title: 'Get Agent View (For Dependencies)',
                command: `# After finding an agent, its 'view' is fetched to find linked Data Stores.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/[FULL_AGENT_RESOURCE_NAME]:getAgentView"`
            },
        ]
    },
    [Page.A2A_TESTER]: {
        description: "The A2A Tester fetches the discovery card from a running Agent-to-Agent service.",
        commands: [
            {
                title: 'Test an A2A Agent (Discovery)',
                command: `# Generate the Identity Token and make the request in one command.
curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \\
  "https://[YOUR_SERVICE_URL].run.app/.well-known/agent.json"`
            },
        ]
    },
    [Page.LICENSE]: {
        description: "License management in this application is currently client-side only, storing the license state in your local browser storage. In a production environment, this would integrate with a licensing backend API.",
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

const CurlInfoModal: React.FC<CurlInfoModalProps> = ({ infoKey, onClose }) => {
  // Fallback for pages that share the same key logic or missing keys
  const info = ALL_INFO[infoKey] || ALL_INFO[Page.AGENTS]; // Default to Agents if key not found (safe fallback)
  
  const titleText = infoKey.startsWith('Backup:') || infoKey.startsWith('Restore:') 
    ? infoKey.replace(':', ' - ')
    : infoKey === 'ArchitectureScan' ? 'Architecture Scan'
    : infoKey;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">API Commands for {titleText}</h2>
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
