import { Agent, AppEngine, Assistant, Authorization, ChatMessage, Config, DataStore, Document, LogEntry, ReasoningEngine, CloudRunService, GcsBucket, GcsObject } from '../types';
import { getGapiClient } from './gapiService';

// Helper functions to get correct base URLs
const getDiscoveryEngineUrl = (location: string): string => {
  if (location === 'global') {
    return 'https://discoveryengine.googleapis.com';
  }
  return `https://${location}-discoveryengine.googleapis.com`;
};

const getAiPlatformUrl = (location: string) => `${location}-aiplatform.googleapis.com`;

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
export const streamChat = async (agentName: string, messages: ChatMessage[], config: Config, accessToken: string, onChunk: (chunk: string) => void) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const assistantName = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${assistantName}:streamConverse`;
    
    const conversationMessages = messages.map(msg => ({ [msg.role === 'user' ? 'userMessage' : 'modelResponseMessage']: { text: msg.content } }));
    const data = {
        messages: conversationMessages,
        session: `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/sessions/agentspace-manager-session`,
        agentsConfig: { agent: agentName },
    };

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
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (line.trim() === '') continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed.reply?.text) onChunk(parsed.reply.text);
            } catch (e) {
                console.warn("Failed to parse stream line:", line);
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
    const path = `${getDiscoveryEngineUrl(config.appLocation)}/v1beta/${dataStoreName}`;
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
    const path = `https://${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${operationName}`;
    return gapiRequest<any>(path, 'GET', projectId);
};

// --- Reasoning Engine (AI Platform) APIs ---
export const listReasoningEngines = (config: Config) => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `https://${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    return gapiRequest<{ reasoningEngines: ReasoningEngine[] }>(path, 'GET', projectId);
};

export const createReasoningEngine = async (engineData: any, config: Config): Promise<ReasoningEngine> => {
    const { reasoningEngineLocation, projectId } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `https://${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<ReasoningEngine>(path, 'POST', projectId, undefined, engineData, headers);
};

export const updateReasoningEngine = async (engineName: string, payload: any, config: Config): Promise<any> => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const updateMask = Object.keys(payload).join(',');
    const path = `https://${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}`;
    const headers = { 'Content-Type': 'application/json' };
    return gapiRequest<any>(path, 'PATCH', projectId, { updateMask }, payload, headers);
};

export const deleteReasoningEngine = (engineName: string, config: Config) => {
    const { projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const path = `https://${getAiPlatformUrl(reasoningEngineLocation)}/v1beta1/${engineName}`;
    return gapiRequest(path, 'DELETE', projectId);
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