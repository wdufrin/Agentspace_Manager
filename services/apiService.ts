

import { Agent, AppEngine, Assistant, Authorization, ChatMessage, Config, DataStore, Document, LogEntry, ReasoningEngine, CloudRunService, GcsBucket, GcsObject } from '../types';
import { getGapiClient } from './gapiService';

// A list of all required API services for the application to function correctly.
const REQUIRED_APIS = [
    'discoveryengine.googleapis.com',
    'aiplatform.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    'logging.googleapis.com',
    'run.googleapis.com',
    'storage.googleapis.com',
    'serviceusage.googleapis.com',
    'cloudbuild.googleapis.com', // Added for deployment
];

// A list of all required IAM permissions for the application's features.
const ALL_REQUIRED_PERMISSIONS = [
    // Discovery Engine
    'discoveryengine.agents.create',
    'discoveryengine.agents.delete',
    'discoveryengine.agents.get',
    'discoveryengine.agents.getIamPolicy',
    'discoveryengine.agents.list',
    'discoveryengine.agents.setIamPolicy',
    'discoveryengine.agents.update',
    'discoveryengine.assistants.assist',
    'discoveryengine.authorizations.create',
    'discoveryengine.authorizations.delete',
    'discoveryengine.authorizations.get',
    'discoveryengine.authorizations.list',
    'discoveryengine.authorizations.update',
    'discoveryengine.collections.get',
    'discoveryengine.collections.list',
    'discoveryengine.dataStores.create',
    'discoveryengine.dataStores.delete',
    'discoveryengine.dataStores.get',
    'discoveryengine.dataStores.list',
    'discoveryengine.dataStores.update',
    'discoveryengine.documents.import',
    'discoveryengine.documents.list',
    'discoveryengine.engines.get',
    'discoveryengine.engines.list',
    'discoveryengine.userStores.licenseConfigsUsageStats.get', 
    'discoveryengine.userStores.listUserLicenses',
    'discoveryengine.userStores.userLicenses.delete', 
    'discoveryengine.userStores.userLicenses.update', 
    'discoveryengine.licenseConfigs.get',
    
    // Vertex AI / AI Platform
    'aiplatform.reasoningEngines.create',
    'aiplatform.reasoningEngines.delete',
    'aiplatform.reasoningEngines.get',
    'aiplatform.reasoningEngines.list',
    'aiplatform.reasoningEngines.update',
    'aiplatform.reasoningEngines.query',
  
    // Cloud Resource Manager
    'resourcemanager.projects.get',
    'resourcemanager.projects.getIamPolicy',
    'resourcemanager.projects.list',
  
    // Cloud Logging
    'logging.logEntries.list',
  
    // Cloud Run
    'run.services.get',
    'run.services.list',
  
    // Cloud Storage
    'storage.buckets.list',
    'storage.objects.create',
    'storage.objects.get',
  
    // Service Usage
    'serviceusage.services.batchEnable',
    'serviceusage.services.get',
    'serviceusage.services.list',

    // Cloud Build
    'cloudbuild.builds.create',
    'cloudbuild.builds.get',
    'cloudbuild.builds.list',
];

const SERVICE_ACCOUNT_REQUIRED_ROLES = [
    'roles/aiplatform.user',
    'roles/storage.objectUser',
];


// Helper functions to get correct base URLs
const getDiscoveryEngineUrl = (location: string): string => {
  if (location === 'global') {
    return 'https://discoveryengine.googleapis.com';
  }
  return `https://${location}-discoveryengine.googleapis.com`;
};

const getAiPlatformUrl = (location: string) => `https://${location}-aiplatform.googleapis.com`;

const getLoggingUrl = () => 'https://logging.googleapis.com';

const getCloudRunUrl = (location: string) => `https://${location}-run.googleapis.com`;

const getCloudBuildUrl = () => 'https://cloudbuild.googleapis.com';

/**
 * A generic helper to handle all GAPI requests and errors.
 * It uses the generic `gapi.client.request` method, which allows for setting custom headers.
 */
async function gapiRequest<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    projectId: string,
    params?: object,
    body?: object,
    additionalHeaders?: Record<string, string>
): Promise<T> {
  try {
    const client = await getGapiClient();
    const headers = { 'X-Goog-User-Project': projectId, ...additionalHeaders };

    const requestConfig: any = { path, method, headers };
    if (params) requestConfig.params = params;
    if (body) requestConfig.body = body;

    const response = await client.request(requestConfig);

    // Handle 204 No Content or other empty responses
    if (response.result === undefined && response.body === "") {
        return {} as T;
    }
    
    return response.result as T;
  } catch (err: any) {
    console.error("GAPI Error Response:", err);
    let errorMessage = 'An unknown error occurred.';
    let statusCode = err.code || 'N/A';

    if (err.result?.error?.message) {
        errorMessage = err.result.error.message;
        statusCode = err.result.error.code || statusCode;
    } else if (typeof err.body === 'string') {
        try {
            const parsedBody = JSON.parse(err.body);
            if (parsedBody.error?.message) {
                errorMessage = parsedBody.error.message;
                statusCode = parsedBody.error.code || statusCode;
            } else {
                 errorMessage = err.body;
            }
        } catch (e) {
            errorMessage = err.body;
        }
    } else if (err.message) {
        // Handle cases where `err` is a standard Error object
        errorMessage = err.message;
    }

    const message = `API request failed with status ${statusCode}: ${errorMessage}`;
    throw new Error(message);
  }
}

// --- API Validation & Permission Checks ---
export const validateEnabledApis = async (projectId: string): Promise<{ enabled: string[], disabled: string[] }> => {
    const client = await getGapiClient();
    const enabled: string[] = [];
    const disabled: string[] = [];

    const checks = REQUIRED_APIS.map(async (apiName) => {
        const resourceName = `projects/${projectId}/services/${apiName}`;
        try {
            const response = await client.serviceusage.services.get({ name: resourceName });
            if (response.result.state === 'ENABLED') {
                enabled.push(apiName);
            } else {
                disabled.push(apiName);
            }
        } catch (err: any) {
            console.error(`Error checking API ${apiName}:`, err);
            // If the API call fails (e.g., 403, 404), it's effectively not usable.
            disabled.push(apiName);
        }
    });

    await Promise.all(checks);
    return { enabled, disabled };
};

// Helper function to parse IAM policy for a specific service account's roles
const checkRolesForPrincipal = (
    policy: any,
    principalEmail: string,
    requiredRoles: string[]
): { granted: string[], denied: string[] } => {
    const granted: string[] = [];
    const principal = `serviceAccount:${principalEmail}`;
    const assignedRoles = new Set<string>();

    if (policy && policy.bindings) {
        for (const binding of policy.bindings) {
            if (binding.members && binding.members.includes(principal)) {
                assignedRoles.add(binding.role);
            }
        }
    }

    const denied = requiredRoles.filter(role => {
        if (assignedRoles.has(role)) {
            granted.push(role);
            return false;
        }
        return true;
    });

    return { granted, denied };
};

export const checkAllPermissions = async (projectNumber: string): Promise<{
    user: { granted: string[], denied: string[] };
    discoverySa: { granted: string[], denied: string[] };
    reasoningEngineSa: { granted: string[], denied: string[] };
}> => {
    const client = await getGapiClient();

    // 1. Check permissions for the logged-in user
    const userPermissionsPromise = client.cloudresourcemanager.projects.testIamPermissions({
        resource: projectNumber,
        permissions: ALL_REQUIRED_PERMISSIONS
    }).then((response: any) => {
        const granted = response.result.permissions || [];
        const denied = ALL_REQUIRED_PERMISSIONS.filter(p => !granted.includes(p));
        return { granted, denied };
    }).catch((err: any) => {
        console.error("GAPI Error during testIamPermissions for user:", err);
        let detailMessage = 'An unknown error occurred while checking permissions.';
        if (typeof err === 'string') {
            detailMessage = err;
        } else if (err instanceof Error) {
            detailMessage = err.message;
        } else if (err?.result?.error?.message) {
            detailMessage = err.result.error.message;
        } else {
            try {
                detailMessage = JSON.stringify(err, null, 2);
            } catch {
                detailMessage = 'A non-serializable error object was caught during permission check.';
            }
        }
        throw new Error(`Failed to check user permissions: ${detailMessage}`);
    });

    // 2. Get the project's IAM policy to check service accounts
    const iamPolicyPromise = client.cloudresourcemanager.projects.getIamPolicy({
        resource: projectNumber,
    }).then((response: any) => response.result)
    .catch((err: any) => {
        console.error("GAPI Error during getIamPolicy:", err);
        let detailMessage = 'An unknown error occurred while getting IAM policy.';
         if (typeof err === 'string') {
            detailMessage = err;
        } else if (err instanceof Error) {
            detailMessage = err.message;
        } else if (err?.result?.error?.message) {
            detailMessage = err.result.error.message;
        } else {
            try {
                detailMessage = JSON.stringify(err, null, 2);
            } catch {
                detailMessage = 'A non-serializable error object was caught during IAM policy fetch.';
            }
        }
        throw new Error(`Failed to get project IAM policy: ${detailMessage}`);
    });

    // Await both promises
    const [userResult, iamPolicy] = await Promise.all([userPermissionsPromise, iamPolicyPromise]);

    // 3. Construct SA names and check their roles from the policy
    const discoverySaEmail = `service-${projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
    const reasoningEngineSaEmail = `service-${projectNumber}@gcp-sa-aiplatform-re.iam.gserviceaccount.com`;

    const discoverySaResult = checkRolesForPrincipal(iamPolicy, discoverySaEmail, SERVICE_ACCOUNT_REQUIRED_ROLES);
    const reasoningEngineSaResult = checkRolesForPrincipal(iamPolicy, reasoningEngineSaEmail, SERVICE_ACCOUNT_REQUIRED_ROLES);

    return {
        user: userResult,
        discoverySa: discoverySaResult,
        reasoningEngineSa: reasoningEngineSaResult,
    };
};

export const checkServiceAccountPermissions = async (projectId: string, saEmail: string, requiredRoles: string[]): Promise<{ hasAll: boolean, missing: string[] }> => {
    const client = await getGapiClient();
    try {
        const policy = await client.cloudresourcemanager.projects.getIamPolicy({
            resource: projectId,
        }).then((response: any) => response.result);

        const grantedRoles = new Set<string>();
        const memberKey = `serviceAccount:${saEmail}`;

        if (policy.bindings) {
            for (const binding of policy.bindings) {
                if (binding.members && binding.members.includes(memberKey)) {
                    grantedRoles.add(binding.role);
                }
            }
        }

        const missing = requiredRoles.filter(role => !grantedRoles.has(role));
        return { hasAll: missing.length === 0, missing };
    } catch (err: any) {
        console.error("Failed to check SA permissions:", err);
        throw new Error(err.message || "Failed to fetch IAM policy.");
    }
};


export const batchEnableApis = async (projectId: string, apiIds: string[]): Promise<any> => {
    const client = await getGapiClient();
    try {
        const response = await client.serviceusage.services.batchEnable({
            parent: `projects/${projectId}`,
            resource: {
                serviceIds: apiIds,
            },
        });
        return response.result;
    } catch (err: any) {
        console.error("GAPI Error during batchEnableApis:", err);
        const errorMessage = err.result?.error?.message || 'An unknown error occurred while trying to enable APIs.';
        throw new Error(errorMessage);
    }
};

export const getServiceUsageOperation = async (operationName: string): Promise<any> => {
    const client = await getGapiClient();
    try {
        const response = await client.serviceusage.operations.get({
            name: operationName
        });
        return response.result;
    } catch (err: any) {
        console.error("GAPI Error during getServiceUsageOperation:", err);
        const errorMessage = err.result?.error?.message || 'An unknown error occurred while polling the operation status.';
        throw new Error(errorMessage);
    }
};


// --- Generic Resource Management ---

export async function listResources(resourceType: 'agents' | 'engines' | 'collections' | 'assistants' | 'dataStores', config: Config): Promise<any> {
    const { projectId, appLocation, collectionId, appId } = config;
    let parent = '';
    const apiVersion = resourceType === 'dataStores' ? 'v1beta' : 'v1alpha';

    switch(resourceType) {
        case 'agents':
            if (!appId || !collectionId || !config.assistantId) throw new Error("Collection, App, and Assistant IDs are required.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${config.assistantId}`;
            break;
        case 'engines':
            if (!collectionId) throw new Error("Collection ID is required.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
            break;
        case 'collections':
            parent = `projects/${projectId}/locations/${appLocation}`;
            break;
        case 'assistants':
            if (!appId || !collectionId) throw new Error("Collection and App IDs are required.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}`;
            break;
        case 'dataStores':
            if (!collectionId) throw new Error("Collection ID is required.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
            break;
    }

    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const path = `${baseUrl}/${apiVersion}/${parent}/${resourceType}`;
    
    return gapiRequest(path, 'GET', projectId);
}

export async function deleteResource(resourceName: string, config: Config): Promise<void> {
    const { projectId, appLocation } = config;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${resourceName}`;
    const headers = { 'Content-Type': 'application/json' };
    await gapiRequest<any>(path, 'DELETE', projectId, undefined, undefined, headers);
}

// --- Project APIs ---
export const getProjectNumber = async (projectId: string): Promise<string> => {
    const client = await getGapiClient();
    try {
        const response = await client.cloudresourcemanager.projects.get({ projectId });
        return response.result.projectNumber;
    } catch (err: any) {
        console.error("GAPI Error during getProjectNumber:", err);
        let errorMessage = 'An unknown error occurred.';
        let statusCode = err.code || 'N/A';
        
        if (err.result?.error?.message) {
            errorMessage = err.result.error.message;
            statusCode = err.result.error.code || statusCode;
        } else if (typeof err.body === 'string') {
            try {
                const parsedBody = JSON.parse(err.body);
                 if (parsedBody.error?.message) {
                    errorMessage = parsedBody.error.message;
                    statusCode = parsedBody.error.code || statusCode;
                } else {
                     errorMessage = err.body;
                }
            } catch (e) {
                errorMessage = err.body;
            }
        } else if (err.message) {
            errorMessage = err.message;
        }
        
        const message = `API request failed with status ${statusCode}: ${errorMessage}`;
        throw new Error(message);
    }
};

export const getProject = async (projectIdOrNumber: string): Promise<{ projectId: string; projectNumber: string }> => {
    const client = await getGapiClient();
    try {
        const response = await client.cloudresourcemanager.projects.get({ projectId: projectIdOrNumber });
        return {
            projectId: response.result.projectId,
            projectNumber: response.result.projectNumber
        };
    } catch (err: any) {
        console.error("GAPI Error during getProject:", err);
        throw new Error(`Failed to get project details: ${err.message}`);
    }
};


// --- Agent Specific APIs ---

export async function getAgent(agentName: string, config: Config): Promise<Agent> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${agentName}`;
    return gapiRequest<Agent>(path, 'GET', config.projectId);
}

export async function getAgentView(agentName: string, config: Config): Promise<any> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${agentName}:getAgentView`;
    return gapiRequest(path, 'GET', config.projectId);
}

export async function getAgentIamPolicy(agentName: string, config: Config): Promise<any> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${agentName}:getIamPolicy`;
    return gapiRequest(path, 'GET', config.projectId);
}

export async function setAgentIamPolicy(resourceName: string, policy: any, config: Config): Promise<any> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${resourceName}:setIamPolicy`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest(path, 'POST', config.projectId, undefined, { policy }, headers);
}

export async function getEngine(engineName: string, config: Config): Promise<AppEngine> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${engineName}`;
    return gapiRequest<AppEngine>(path, 'GET', config.projectId);
}

export async function getAssistant(assistantName: string, config: Config): Promise<Assistant> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${assistantName}`;
    return gapiRequest<Assistant>(path, 'GET', config.projectId);
}

export async function createAgent(apiPayload: any, config: Config, agentId?: string): Promise<Agent> {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${parent}/agents`;
    const params = agentId ? { agentId } : undefined;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Agent>(path, 'POST', projectId, params, apiPayload, headers);
}

export async function registerA2aAgent(
    config: Config,
    agentId: string,
    payload: any
): Promise<Agent> {
    const { projectId, appLocation, appId, assistantId, collectionId } = config;
    if (!appId) throw new Error("App/Engine ID is required for agent registration.");
    
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${parent}/agents`;
    const headers = { 'Content-Type': 'application/json' };
    const params = { agentId };

    return gapiRequest<Agent>(path, 'POST', projectId, params, payload, headers);
}

export async function updateAgent(originalAgent: Agent, updatedAgent: Partial<Agent>, config: Config): Promise<Agent> {
    const { projectId, appLocation } = config;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${originalAgent.name}`;

    const updateMask: string[] = [];
    const payload: any = {};

    if (originalAgent.adkAgentDefinition) {
        payload.adkAgentDefinition = {
            tool_settings: { tool_description: originalAgent.adkAgentDefinition.toolSettings?.toolDescription },
            provisioned_reasoning_engine: { reasoning_engine: originalAgent.adkAgentDefinition.provisionedReasoningEngine?.reasoningEngine }
        };
    }

    if (updatedAgent.displayName !== undefined && originalAgent.displayName !== updatedAgent.displayName) {
        updateMask.push('display_name');
        payload.displayName = updatedAgent.displayName;
    }
    if (updatedAgent.description !== undefined && originalAgent.description !== updatedAgent.description) {
        updateMask.push('description');
        payload.description = updatedAgent.description;
    }
    if (updatedAgent.adkAgentDefinition && JSON.stringify(originalAgent.adkAgentDefinition) !== JSON.stringify(updatedAgent.adkAgentDefinition)) {
        updateMask.push('adk_agent_definition');
        payload.adkAgentDefinition = {
             tool_settings: { tool_description: updatedAgent.adkAgentDefinition.toolSettings?.toolDescription },
             provisioned_reasoning_engine: { reasoning_engine: updatedAgent.adkAgentDefinition.provisionedReasoningEngine?.reasoningEngine }
        };
    }
    if (updatedAgent.icon !== undefined && JSON.stringify(originalAgent.icon) !== JSON.stringify(originalAgent.icon)) {
        updateMask.push('icon');
        payload.icon = updatedAgent.icon;
    }
    if (updatedAgent.starterPrompts !== undefined && JSON.stringify(originalAgent.starterPrompts) !== JSON.stringify(originalAgent.starterPrompts)) {
        updateMask.push('starter_prompts');
        payload.starterPrompts = updatedAgent.starterPrompts;
    }

    if (updateMask.length === 0) return originalAgent;
    
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Agent>(path, 'PATCH', projectId, { updateMask: updateMask.join(',') }, payload, headers);
}

export async function enableAgent(agentName: string, config: Config): Promise<Agent> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${agentName}:enableAgent`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Agent>(path, 'POST', config.projectId, undefined, {}, headers);
}

export async function disableAgent(agentName: string, config: Config): Promise<Agent> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${agentName}:disableAgent`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Agent>(path, 'POST', config.projectId, undefined, {}, headers);
}

// NOTE: streamChat CANNOT be converted to gapi as it does not support streaming responses.
// It must continue to use fetch and requires the accessToken to be passed manually.
export const streamChat = async (agentName: string | null, query: string, sessionId: string | null, config: Config, accessToken: string, onChunk: (chunk: any) => void) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const assistantName = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${assistantName}:streamAssist`;

    const data: any = {
        query: { text: query },
    };
    
    if (agentName) {
        data.agentsConfig = { agent: agentName };
    }

    if (sessionId) {
        data.session = sessionId;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(data),
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`HTTP Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // The API returns a stream of JSON objects that are not always newline-separated.
        // We need to handle this by finding valid JSON objects in the buffer.
        let jsonStart = buffer.indexOf('{');
        let openBraces = 0;
        
        for (let i = jsonStart; i < buffer.length; i++) {
            if (buffer[i] === '{') {
                openBraces++;
            } else if (buffer[i] === '}') {
                openBraces--;
                if (openBraces === 0 && jsonStart !== -1) {
                    const jsonString = buffer.substring(jsonStart, i + 1);
                    try {
                        const parsed = JSON.parse(jsonString);
                        onChunk(parsed);
                    } catch (e) {
                        console.warn("Failed to parse stream chunk:", jsonString);
                    }
                    // Reset buffer to what's left
                    buffer = buffer.substring(i + 1);
                    jsonStart = buffer.indexOf('{');
                    i = jsonStart - 1; // Adjust loop counter
                }
            }
        }
    }
};

// --- A2A Agent APIs ---

export const fetchA2aAgentCard = async (
    agentUrl: string,
    identityToken: string
): Promise<any> => {
    const cardUrl = `${agentUrl}/.well-known/agent.json`;

    try {
        const response = await fetch(cardUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${identityToken}`,
            },
        });

        if (!response.ok) {
            let errorMessage = `Request failed with status ${response.status}`;
            try {
                const responseBody = await response.json();
                errorMessage = responseBody.error || errorMessage;
            } catch (e) {
                // ignore
            }
            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (err: any) {
        // Enhance error message for common CORS failures
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            throw new Error("Network error. This is often due to CORS (Cross-Origin Resource Sharing) restrictions on the Cloud Run service. Ensure the service allows requests from this origin, or try the cURL command in your terminal.");
        }
        throw err;
    }
};

export const invokeA2aAgent = async (
    agentUrl: string,
    prompt: string,
    accessToken: string
): Promise<any> => {
    // Ensure clean URL
    const cleanUrl = agentUrl.replace(/\/$/, '');
    const invokeUrl = cleanUrl.endsWith('/invoke') ? cleanUrl : `${cleanUrl}/invoke`;

    // Wrap in A2A JSON-RPC 2.0 format (message -> parts)
    const payload = {
        jsonrpc: "2.0",
        method: "chat",
        params: {
            message: {
                role: "user",
                parts: [
                    { text: prompt }
                ]
            }
        },
        id: crypto.randomUUID()
    };

    try {
        const response = await fetch(invokeUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorMessage = `Request failed with status ${response.status}`;
            try {
                const responseBody = await response.json();
                if (responseBody.error) {
                    errorMessage = responseBody.error.message || JSON.stringify(responseBody.error);
                } else {
                    errorMessage = JSON.stringify(responseBody);
                }
            } catch (e) {
                const text = await response.text();
                if (text) errorMessage = text;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error.message || JSON.stringify(data.error));
        }
        
        // Return the 'result' object from JSON-RPC response
        // A2A result structure: { message: { role: "agent", parts: [...] } }
        return data.result; 

    } catch (err: any) {
        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            throw new Error("Network error. This is often due to CORS (Cross-Origin Resource Sharing) restrictions on the Cloud Run service. Ensure the service allows requests from this origin, or try the cURL command in your terminal.");
        }
        throw err;
    }
};


// --- Authorization APIs ---
export const listAuthorizations = (config: Config) => {
    const { projectId } = config;
    const path = `${getDiscoveryEngineUrl('global')}/v1alpha/projects/${projectId}/locations/global/authorizations`;
    return gapiRequest<{ authorizations: Authorization[] }>(path, 'GET', projectId);
};

export const getAuthorization = (authName: string, config: Config) => {
    const path = `${getDiscoveryEngineUrl('global')}/v1alpha/${authName}`;
    return gapiRequest<Authorization>(path, 'GET', config.projectId);
};

export const createAuthorization = (authId: string, authData: object, config: Config) => {
    const { projectId } = config;
    const path = `${getDiscoveryEngineUrl('global')}/v1alpha/projects/${projectId}/locations/global/authorizations`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Authorization>(path, 'POST', projectId, { authorizationId: authId }, authData, headers);
};

export const updateAuthorization = (authName: string, authData: object, updateMask: string[], config: Config) => {
    const path = `${getDiscoveryEngineUrl('global')}/v1alpha/${authName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Authorization>(path, 'PATCH', config.projectId, { updateMask: updateMask.join(',') }, authData, headers);
};

export const deleteAuthorization = (authId: string, config: Config) => {
    const path = `${getDiscoveryEngineUrl('global')}/v1alpha/projects/${config.projectId}/locations/global/authorizations/${authId}`;
    return gapiRequest(path, 'DELETE', config.projectId);
};

// --- Data Store APIs ---
export async function getDataStore(dataStoreName: string, config: Config): Promise<DataStore> {
    // projects/{projectId}/locations/{location}/collections/{collectionId}/dataStores/{dataStoreId}
    const parts = dataStoreName.split('/');
    // Use location from the resource name if available, otherwise fallback to config.
    const resourceLocation = parts.length > 3 ? parts[3] : config.appLocation;
    const path = `${getDiscoveryEngineUrl(resourceLocation)}/v1beta/${dataStoreName}`;
    return gapiRequest<DataStore>(path, 'GET', config.projectId);
}

export async function deleteDataStore(dataStoreName: string, config: Config): Promise<any> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1beta/${dataStoreName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'DELETE', config.projectId, undefined, undefined, headers);
}

export async function updateDataStore(dataStoreName: string, payload: { displayName: string }, config: Config): Promise<DataStore> {
    const resourceLocation = dataStoreName.split('/')[3] || config.appLocation;
    const path = `${getDiscoveryEngineUrl(resourceLocation)}/v1beta/${dataStoreName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<DataStore>(path, 'PATCH', config.projectId, { updateMask: 'displayName' }, payload, headers);
}

export async function getDocument(documentName: string, config: Config): Promise<Document> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${documentName}`;
    return gapiRequest<Document>(path, 'GET', config.projectId);
}

export async function listDocuments(dataStoreName: string, config: Config): Promise<any> {
    const parent = `${dataStoreName}/branches/default_branch`;
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${parent}/documents`;
    return gapiRequest(path, 'GET', config.projectId);
}

export async function importDocuments(dataStoreName: string, gcsUris: string[], gcsBucket: string, config: Config): Promise<any> {
    const parent = `${dataStoreName}/branches/default_branch`;
    const resourceLocation = dataStoreName.split('/')[3] || config.appLocation;
    const path = `${getDiscoveryEngineUrl(resourceLocation)}/v1alpha/${parent}/documents:import`;
    const dataStoreId = dataStoreName.split('/').pop();
    
    const body = {
        gcsSource: {
            inputUris: gcsUris,
            dataSchema: "content"
        },
        reconciliationMode: 'INCREMENTAL',
        errorConfig: {
            gcsPrefix: `gs://${gcsBucket}/import_errors/${dataStoreId}/`
        }
    };
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', config.projectId, undefined, body, headers);
}

// --- Discovery Resource Creation APIs ---
export const createCollection = async (collectionId: string, payload: { displayName: string }, config: Config) => {
    const { projectId, appLocation } = config;
    const parent = `projects/${projectId}/locations/${appLocation}`;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/collections`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', projectId, { collectionId }, payload, headers);
};

export const createEngine = async (engineId: string, payload: object, config: Config) => {
    const { projectId, appLocation, collectionId } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    // Add a trailing slash to work around a GAPI client bug that misparses the path.
    const url = `${baseUrl}/v1alpha/${parent}/engines/?engineId=${encodeURIComponent(engineId)}`;

    // Get the access token from the initialized gapi client
    const client = await getGapiClient();
    const token = client.getToken();
    if (!token || !token.access_token) {
        throw new Error("GAPI client is not authenticated. Access token is missing.");
    }
    const accessToken = token.access_token;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Goog-User-Project': projectId,
            },
            body: JSON.stringify(payload),
        });

        const responseBody = await response.json();

        if (!response.ok) {
            console.error("Fetch API Error Response:", responseBody);
            const statusCode = responseBody.error?.code || response.status;
            const errorMessage = responseBody.error?.message || `API request failed with status ${statusCode}`;
            throw new Error(`API request failed with status ${statusCode}: ${errorMessage}`);
        }

        return responseBody;
    } catch (err: any) {
        if (err.message.startsWith('API request failed')) {
            throw err;
        }
        console.error("Generic Fetch Error:", err);
        throw new Error(`An unexpected network error occurred: ${err.message}`);
    }
};

export const createDataStore = async (dataStoreId: string, payload: object, config: Config) => {
    const { projectId, appLocation, collectionId } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/dataStores`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', projectId, { dataStoreId }, payload, headers);
};

export const createAssistant = async (assistantId: string, payload: { displayName: string }, config: Config) => {
    const { projectId, appLocation, collectionId, appId } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}`;
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/assistants`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', projectId, { assistantId }, payload, headers);
};

export const updateAssistant = async (assistantName: string, payload: any, updateMask: string[], config: Config): Promise<Assistant> => {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${assistantName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Assistant>(path, 'PATCH', config.projectId, { updateMask: updateMask.join(',') }, payload, headers);
};

export const updateServingConfig = async (servingConfigName: string, payload: any, updateMask: string[], config: Config): Promise<any> => {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${servingConfigName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'PATCH', config.projectId, { updateMask: updateMask.join(',') }, payload, headers);
};

// --- Operation APIs ---
export const getDiscoveryOperation = async (operationName: string, config: Config, apiVersion: 'v1alpha' | 'v1beta' = 'v1beta'): Promise<any> => {
    const location = operationName.split('/')[3] || config.appLocation;
    const path = `${getDiscoveryEngineUrl(location)}/${apiVersion}/${operationName}`;
    return gapiRequest<any>(path, 'GET', config.projectId);
};

export const getOperation = async (operationName: string, config: Config): Promise<any> => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${operationName}`;
    return gapiRequest<any>(path, 'GET', projectId);
};

// --- Reasoning Engine (AI Platform) APIs ---
export const listReasoningEngines = (config: Config) => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    return gapiRequest<{ reasoningEngines: ReasoningEngine[] }>(path, 'GET', projectId);
};

export const getReasoningEngine = async (engineName: string, config: Config): Promise<ReasoningEngine> => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}`;
    return gapiRequest<ReasoningEngine>(path, 'GET', projectId);
};

export const createReasoningEngine = async (engineData: any, config: Config): Promise<any> => {
    const { reasoningEngineLocation, projectId } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', projectId, undefined, engineData, headers);
};

export const updateReasoningEngine = async (engineName: string, payload: any, config: Config): Promise<any> => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const updateMask = Object.keys(payload).join(',');
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'PATCH', projectId, { updateMask }, payload, headers);
};

export const deleteReasoningEngine = (engineName: string, config: Config) => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}`;
    return gapiRequest(path, 'DELETE', projectId);
};

export const listReasoningEngineSessions = (engineName: string, config: Config): Promise<{ sessions?: { name: string }[] }> => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}/sessions`;
    return gapiRequest<{ sessions?: { name: string }[] }>(path, 'GET', projectId);
};

export const deleteReasoningEngineSession = (sessionName: string, config: Config): Promise<void> => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${sessionName}`;
    return gapiRequest(path, 'DELETE', projectId);
};

// NOTE: streamQueryReasoningEngine must use fetch due to streaming responses not supported by gapi.
export const streamQueryReasoningEngine = async (
    engineName: string,
    query: string,
    userId: string,
    config: Config,
    accessToken: string,
    onChunk: (chunk: any) => void
) => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine location is required.");
    
    const url = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}:streamQuery`;

    const data = {
        input: {
            message: query,
            user_id: userId,
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId,
        },
        body: JSON.stringify(data),
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`HTTP Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // The stream returns one or more complete JSON objects, not always newline-separated.
        let jsonStart = buffer.indexOf('{');
        let openBraces = 0;
        
        for (let i = jsonStart; i < buffer.length; i++) {
            if (buffer[i] === '{') {
                openBraces++;
            } else if (buffer[i] === '}') {
                openBraces--;
                if (openBraces === 0 && jsonStart !== -1) {
                    const jsonString = buffer.substring(jsonStart, i + 1);
                    try {
                        const parsed = JSON.parse(jsonString);
                        onChunk(parsed);
                    } catch (e) {
                        console.warn("Failed to parse stream chunk:", jsonString, e);
                    }
                    // Reset buffer to what's left
                    buffer = buffer.substring(i + 1);
                    jsonStart = buffer.indexOf('{');
                    i = jsonStart - 1; // Adjust loop counter
                }
            }
        }
    }
};


// --- Cloud Run API ---
export async function listCloudRunServices(config: Config, location: string): Promise<{ services: CloudRunService[] }> {
    const path = `${getCloudRunUrl(location)}/v2/projects/${config.projectId}/locations/${location}/services`;
    return gapiRequest<{ services: CloudRunService[] }>(path, 'GET', config.projectId);
}

export async function getCloudRunService(serviceName: string, config: Config): Promise<CloudRunService> {
    const location = serviceName.split('/')[3];
    const path = `${getCloudRunUrl(location)}/v2/${serviceName}`;
    return gapiRequest<CloudRunService>(path, 'GET', config.projectId);
}

// --- Vertex AI / AI Platform APIs (General) ---
export async function listVertexAiModels(location: string, projectId: string): Promise<{ models: any[] }> {
    const path = `https://${location}-aiplatform.googleapis.com/v1/publishers/google/models`;
    const client = await getGapiClient();
    // This public endpoint does not need the X-Goog-User-Project header.
    const response = await client.request({ path, method: 'GET' });
    return response.result;
}

// --- GCS Storage API ---
export async function listBuckets(projectId: string): Promise<{ items: GcsBucket[] }> {
    const path = `https://storage.googleapis.com/storage/v1/b`;
    return gapiRequest<{ items: GcsBucket[] }>(path, 'GET', projectId, { project: projectId });
}

export async function listGcsObjects(bucketName: string, prefix: string, projectId: string): Promise<{ items: GcsObject[] }> {
    const path = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o`;
    return gapiRequest(path, 'GET', projectId, { prefix });
}

// GCS uploads are special and cannot use the generic gapiRequest helper due to binary bodies and non-JSON responses.
// We use fetch directly to properly handle binary payloads (Blob/File).
async function gcsUploadRequest(path: string, projectId: string, body: File | string | Blob, contentType: string): Promise<void> {
    const client = await getGapiClient();
    const tokenObj = client.getToken();
    const token = tokenObj ? tokenObj.access_token : '';

    if (!token) throw new Error("No access token found for GCS upload.");

    try {
        const response = await fetch(path, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': contentType,
                'X-Goog-User-Project': projectId
            },
            body: body
        });
        
        if (!response.ok) {
             const text = await response.text();
             let msg = text;
             try {
                 const json = JSON.parse(text);
                 if(json.error && json.error.message) msg = json.error.message;
             } catch(e) {}
             throw new Error(`GCS upload failed: ${response.status} ${response.statusText} - ${msg}`);
        }
    } catch (err: any) {
        console.error("GCS Upload GAPI Error:", err);
        throw new Error(err.message || 'Unknown GCS error.');
    }
}

export async function uploadToGcs(bucketName: string, objectName: string, fileContent: string, contentType: string, projectId: string): Promise<void> {
    const path = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    await gcsUploadRequest(path, projectId, fileContent, contentType);
}

export async function uploadFileToGcs(bucketName: string, objectName: string, file: File, projectId: string): Promise<void> {
    const path = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    await gcsUploadRequest(path, projectId, file, file.type || 'application/octet-stream');
}

// --- Cloud Build API ---
export async function createCloudBuild(projectId: string, buildConfig: any): Promise<any> {
    const path = `${getCloudBuildUrl()}/v1/projects/${projectId}/builds`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', projectId, undefined, buildConfig, headers);
}

export async function getCloudBuild(projectId: string, buildId: string): Promise<any> {
    const path = `${getCloudBuildUrl()}/v1/projects/${projectId}/builds/${buildId}`;
    return gapiRequest<any>(path, 'GET', projectId);
}

export async function fetchBuildLogs(projectId: string, buildId: string): Promise<string[]> {
    const path = `${getLoggingUrl()}/v2/entries:list`;
    const filter = `resource.type="build" AND resource.labels.build_id="${buildId}"`;
    const body = {
        resourceNames: [`projects/${projectId}`],
        filter: filter,
        orderBy: "timestamp asc",
        pageSize: 1000
    };
    const headers = { 'Content-Type': 'application/json' };
    const response = await gapiRequest<{ entries?: LogEntry[] }>(path, 'POST', projectId, undefined, body, headers);
    return (response.entries || []).map(e => e.textPayload || JSON.stringify(e.jsonPayload) || '');
}

// --- Cloud Logging APIs ---
export async function fetchViolationLogs(config: Config, customFilter: string): Promise<{ entries?: LogEntry[] }> {
    const { projectId } = config;
    const path = `${getLoggingUrl()}/v2/entries:list`;
    const baseFilter = `log_id("modelarmor.googleapis.com/sanitize_operations")`;
    const finalFilter = customFilter ? `${baseFilter} AND (${customFilter})` : baseFilter;

    const body = {
        projectIds: [projectId],
        filter: finalFilter,
        orderBy: "timestamp desc",
        pageSize: 100,
    };
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<{ entries?: LogEntry[] }>(path, 'POST', projectId, undefined, body, headers);
}

// --- License APIs ---
export async function getLicenseUsageStats(config: Config, userStoreId: string): Promise<any> {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const path = `${baseUrl}/v1beta/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/licenseConfigsUsageStats`;
    return gapiRequest(path, 'GET', projectId);
}

export async function listUserLicenses(config: Config, userStoreId: string, filter?: string, pageToken?: string, pageSize?: number): Promise<any> {
    const { projectId, appLocation } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}`;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const path = `${baseUrl}/v1alpha/${parent}/userLicenses`;
    
    const params: any = {};
    if (filter) params.filter = filter;
    if (pageToken) params.pageToken = pageToken;
    if (pageSize) params.pageSize = pageSize;
    
    return gapiRequest(path, 'GET', projectId, params);
}

export async function getLicenseConfig(resourceName: string, config: Config): Promise<any> {
    // Switch to v1 as requested/documented
    const parts = resourceName.split('/');
    const location = parts.length > 3 ? parts[3] : config.appLocation;
    const baseUrl = getDiscoveryEngineUrl(location);
    const path = `${baseUrl}/v1/${resourceName}`;
    return gapiRequest(path, 'GET', config.projectId);
}

// Deprecated in favor of revokeUserLicenses, but kept for fallback if needed in other contexts (though page logic has moved away)
export async function deleteUserLicense(resourceName: string, config: Config): Promise<void> {
    if (!resourceName) {
        throw new Error("License resource name is required for deletion.");
    }
    const parts = resourceName.split('/');
    const location = parts.length > 3 ? parts[3] : config.appLocation;
    const baseUrl = getDiscoveryEngineUrl(location);
    const path = `${baseUrl}/v1alpha/${resourceName}`;
    return gapiRequest<void>(path, 'DELETE', config.projectId);
}

export async function revokeUserLicenses(config: Config, userStoreId: string, userPrincipals: string[]): Promise<any> {
    const { projectId, appLocation } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}`;
    // Using v1 for batch update as per user request
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const path = `${baseUrl}/v1/${parent}:batchUpdateUserLicenses`;

    const body = {
        inlineSource: {
            userLicenses: userPrincipals.map(p => ({ userPrincipal: p })),
            updateMask: {
                paths: ["userPrincipal", "licenseConfig"]
            }
        },
        deleteUnassignedUserLicenses: true
    };
    
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest(path, 'POST', projectId, undefined, body, headers);
}