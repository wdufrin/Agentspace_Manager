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
    'serviceusage.googleapis.com', // Required for this validation check itself
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
    'discoveryengine.documents.list',
    'discoveryengine.engines.get',
    'discoveryengine.engines.list',
    
    // Vertex AI / AI Platform
    'aiplatform.reasoningEngines.create',
    'aiplatform.reasoningEngines.delete',
    'aiplatform.reasoningEngines.get',
    'aiplatform.reasoningEngines.list',
    'aiplatform.reasoningEngines.update',
    'aiplatform.reasoningEngines.query', // For direct query
  
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
    if (err.result?.error?.message) {
        errorMessage = err.result.error.message;
    } else if (typeof err.body === 'string') {
        try {
            const parsedBody = JSON.parse(err.body);
            errorMessage = parsedBody.error?.message || err.body;
        } catch (e) {
            errorMessage = err.body;
        }
    }
    const message = `API request failed with status ${err.code || 'N/A'}: ${errorMessage}`;
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
    // FIX: The gapiRequest helper was being used incorrectly. Switched to a direct GAPI client call.
    const client = await getGapiClient();
    try {
        const response = await client.cloudresourcemanager.projects.get({ projectId });
        return response.result.projectNumber;
    } catch (err: any) {
        console.error("GAPI Error during getProjectNumber:", err);
        let errorMessage = 'An unknown error occurred.';
        if (err.result?.error?.message) {
            errorMessage = err.result.error.message;
        }
        const message = `API request failed with status ${err.code || 'N/A'}: ${errorMessage}`;
        throw new Error(message);
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
    const params = agentId ? { agent_id: agentId } : undefined;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Agent>(path, 'POST', projectId, params, apiPayload, headers);
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
    if (updatedAgent.icon !== undefined && JSON.stringify(originalAgent.icon) !== JSON.stringify(updatedAgent.icon)) {
        updateMask.push('icon');
        payload.icon = updatedAgent.icon;
    }
    if (updatedAgent.starterPrompts !== undefined && JSON.stringify(originalAgent.starterPrompts) !== JSON.stringify(updatedAgent.starterPrompts)) {
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
export const streamChat = async (agentName: string, query: string, sessionId: string | null, config: Config, accessToken: string, onChunk: (chunk: any) => void) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const assistantName = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${assistantName}:streamAssist`;

    const data: any = {
        query: { text: query },
        agentsConfig: { agent: agentName },
    };

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

export async function getDocument(documentName: string, config: Config): Promise<Document> {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${documentName}`;
    return gapiRequest<Document>(path, 'GET', config.projectId);
}

export async function listDocuments(dataStoreName: string, config: Config): Promise<any> {
    const parent = `${dataStoreName}/branches/default_branch`;
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1alpha/${parent}/documents`;
    return gapiRequest(path, 'GET', config.projectId);
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
    const path = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/engines`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'POST', projectId, { engineId }, payload, headers);
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

export const updateAssistant = async (assistantName: string, payload: Partial<Assistant>, updateMask: string[], config: Config): Promise<Assistant> => {
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1beta/${assistantName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<Assistant>(path, 'PATCH', config.projectId, { updateMask: updateMask.join(',') }, payload, headers);
};

// --- Operation APIs ---
export const getDiscoveryOperation = async (operationName: string, config: Config): Promise<any> => {
    const location = operationName.split('/')[3] || config.appLocation;
    const path = `${getDiscoveryEngineUrl(location)}/v1beta/${operationName}`;
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

export const createReasoningEngine = async (engineData: any, config: Config): Promise<ReasoningEngine> => {
    const { reasoningEngineLocation, projectId } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<ReasoningEngine>(path, 'POST', projectId, undefined, engineData, headers);
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
async function gcsUploadRequest(path: string, projectId: string, body: File | string, contentType: string): Promise<void> {
    const client = await getGapiClient();
    try {
        const response = await client.request({
            path,
            method: 'POST',
            headers: { 'Content-Type': contentType, 'X-Goog-User-Project': projectId },
            body,
        });
        if (response.status < 200 || response.status >= 300) {
            throw response; // Throw the whole response object on failure
        }
    } catch (err: any) {
        console.error("GCS Upload GAPI Error:", err);
        const errorBody = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
        const message = `GCS upload failed with status ${err.status}: ${errorBody?.error?.message || 'Unknown GCS error.'}`;
        throw new Error(message);
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