import { Agent, AppEngine, Assistant, Authorization, ChatMessage, Config, DataStore, Document, ReasoningEngine } from '../types';

// Helper functions to get correct base URLs
const getDiscoveryEngineUrl = (location: string): string => {
  if (location === 'global') {
    return 'https://discoveryengine.googleapis.com';
  }
  return `https://${location}-discoveryengine.googleapis.com`;
};

const getAiPlatformUrl = (location: string) => `https://${location}-aiplatform.googleapis.com/v1beta1`;

// A generic helper to handle all API requests and errors
async function apiRequest<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    console.error("API Error Response:", errorText);
    try {
        const errorData = JSON.parse(errorText);
        const message = `API request failed with status ${response.status}: ${errorData.error?.message || errorText}`;
        throw new Error(message);
    } catch(e) {
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
  }
  
  // Handle 204 No Content or other empty responses
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  // Handle long-running operations that might be returned directly
  const parsedResponse = JSON.parse(text);
  if (parsedResponse.name && (parsedResponse.name.includes('/operations/') || parsedResponse.name.includes('/long-running-operations/')) && !parsedResponse.done) {
    // It's an operation, so let's poll it.
    // Note: This is a simplification; for a robust solution, you'd want to handle this more explicitly
    // where the operation is expected. The createReasoningEngine handles this correctly already.
    // For now, we'll return the operation object.
    return parsedResponse as T;
  }


  return parsedResponse as T;
}

// --- Generic Resource Management ---

// FIX: Added 'dataStores' to the resourceType to support listing them, which is required by the Backup page.
export async function listResources(resourceType: 'agents' | 'engines' | 'collections' | 'assistants' | 'dataStores', config: Config): Promise<any> {
    const { projectId, appLocation, collectionId, appId, accessToken } = config;
    let parent = '';
    // FIX: Data Stores list API is on v1beta, while others are on v1alpha.
    const apiVersion = resourceType === 'dataStores' ? 'v1beta' : 'v1alpha';

    switch(resourceType) {
        case 'agents':
            if (!appId) throw new Error("App ID (Engine ID) is required to list agents.");
            if (!collectionId) throw new Error("Collection ID is required to list agents.");
            if (!config.assistantId) throw new Error("Assistant ID is required to list agents.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${config.assistantId}`;
            break;
        case 'engines':
            if (!collectionId) throw new Error("Collection ID is required to list engines.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
            break;
        case 'collections':
            parent = `projects/${projectId}/locations/${appLocation}`;
            break;
        case 'assistants':
            if (!appId) throw new Error("App ID (Engine ID) is required to list assistants.");
            if (!collectionId) throw new Error("Collection ID is required to list assistants.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}`;
            break;
        // FIX: Added case for 'dataStores' to build the correct parent path.
        case 'dataStores':
            if (!collectionId) throw new Error("Collection ID is required to list data stores.");
            parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
            break;
    }

    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${apiVersion}/${parent}/${resourceType}`;
    
    return apiRequest(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId,
        },
    });
}

export async function deleteResource(resourceName: string, config: Config): Promise<void> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    // FIX: Reverted to v1alpha, which is the correct endpoint for agent deletion.
    const url = `${baseUrl}/v1alpha/${resourceName}`;

    await apiRequest<any>(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            // FIX: Re-added Content-Type. The Discovery Engine API appears to require this header
            // for DELETE requests, unlike other Google Cloud APIs.
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId,
        },
    });
}

// --- Project APIs ---
export const getProjectNumber = async (projectId: string, accessToken: string): Promise<string> => {
    const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`;
    const response = await apiRequest<{ projectNumber: string }>(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    return response.projectNumber;
};


// --- Agent Specific APIs ---

export async function getAgent(agentName: string, config: Config): Promise<Agent> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${agentName}`;
    return apiRequest<Agent>(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export async function getAgentView(agentName: string, config: Config): Promise<any> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${agentName}:getAgentView`;

    return apiRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export async function getEngine(engineName: string, config: Config): Promise<AppEngine> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${engineName}`;
    return apiRequest<AppEngine>(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export async function getAssistant(assistantName: string, config: Config): Promise<Assistant> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${assistantName}`;
    return apiRequest<Assistant>(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export async function createAgent(apiPayload: any, config: Config, agentId?: string): Promise<Agent> {
    const { projectId, appLocation, collectionId, appId, assistantId, accessToken } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    let url = `${baseUrl}/v1alpha/${parent}/agents`;
    if (agentId) {
        url += `?agent_id=${agentId}`;
    }

    return apiRequest<Agent>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(apiPayload),
    });
}

export async function updateAgent(originalAgent: Agent, updatedAgent: Partial<Agent>, config: Config): Promise<Agent> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${originalAgent.name}`;

    const updateMask: string[] = [];
    const payload: any = {};

    // Per API requirements, the agent's definition must be included in the payload.
    // The payload key must be camelCase, but nested keys (and updateMask) are often snake_case.
    if (originalAgent.adkAgentDefinition) {
        payload.adkAgentDefinition = {
            tool_settings: { tool_description: originalAgent.adkAgentDefinition.toolSettings?.toolDescription },
            provisioned_reasoning_engine: { reasoning_engine: originalAgent.adkAgentDefinition.provisionedReasoningEngine?.reasoningEngine }
        };
    }

    // Compare fields and build the updateMask and payload.
    if (updatedAgent.displayName !== undefined && originalAgent.displayName !== updatedAgent.displayName) {
        updateMask.push('display_name');
        payload.displayName = updatedAgent.displayName;
    }
    if (updatedAgent.description !== undefined && originalAgent.description !== updatedAgent.description) {
        updateMask.push('description');
        payload.description = updatedAgent.description;
    }
    
    // If the definition IS being updated, overwrite the one in the payload and add it to the mask.
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

    if (updateMask.length === 0) {
        return originalAgent; // No changes
    }
    
    return apiRequest<Agent>(`${url}?updateMask=${updateMask.join(',')}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(payload),
    });
}


export async function enableAgent(agentName: string, config: Config): Promise<Agent> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${agentName}:enableAgent`;
    return apiRequest<Agent>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify({}),
    });
}

export async function disableAgent(agentName: string, config: Config): Promise<Agent> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${agentName}:disableAgent`;
    return apiRequest<Agent>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify({}),
    });
}


export const streamChat = async (agentName: string, messages: ChatMessage[], config: Config, onChunk: (chunk: string) => void) => {
    const { accessToken, projectId, appLocation, collectionId, appId, assistantId } = config;
    const assistantName = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}`;
    
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1alpha/${assistantName}:streamConverse`;
    
    const conversationMessages = messages.map(msg => {
        if (msg.role === 'user') {
            return { userMessage: { text: msg.content } };
        } else {
            return { modelResponseMessage: { text: msg.content } };
        }
    });
    
    const data = {
        messages: conversationMessages,
        session: `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/sessions/agentspace-manager-session`, // static session is fine for this tool
        agentsConfig: { agent: agentName },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(data),
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text();
         try {
            const errorJson = JSON.parse(errorText);
            throw new Error(`API Error: ${errorJson.error?.message || errorText}`);
        } catch(e) {
            throw new Error(`HTTP Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep any incomplete line for the next chunk

        for (const line of lines) {
            if (line.trim() === '') continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed.reply?.text) {
                    onChunk(parsed.reply.text);
                }
            } catch (e) {
                console.warn("Failed to parse stream line:", line);
            }
        }
    }
};

// --- Authorization APIs ---
export const listAuthorizations = (config: Config) => {
    const { accessToken, projectId } = config;
    const url = `${getDiscoveryEngineUrl('global')}/v1alpha/projects/${projectId}/locations/global/authorizations`;
    return apiRequest<{ authorizations: Authorization[] }>(url, {
        method: "GET",
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
};

export const getAuthorization = (authName: string, config: Config) => {
    const { accessToken, projectId } = config;
    const url = `${getDiscoveryEngineUrl('global')}/v1alpha/${authName}`;
     return apiRequest<Authorization>(url, {
        method: "GET",
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export const createAuthorization = (authId: string, authData: object, config: Config) => {
    const { accessToken, projectId } = config;
    const url = `${getDiscoveryEngineUrl('global')}/v1alpha/projects/${projectId}/locations/global/authorizations?authorizationId=${authId}`;
    return apiRequest<Authorization>(url, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(authData),
    });
};

export const updateAuthorization = (authName: string, authData: object, updateMask: string[], config: Config) => {
    const { accessToken, projectId } = config;
    const url = `${getDiscoveryEngineUrl('global')}/v1alpha/${authName}?updateMask=${updateMask.join(',')}`;
    return apiRequest<Authorization>(url, {
        method: "PATCH",
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(authData),
    });
};

export const deleteAuthorization = (authId: string, config: Config) => {
    const { accessToken, projectId } = config;
    const url = `${getDiscoveryEngineUrl('global')}/v1alpha/projects/${projectId}/locations/global/authorizations/${authId}`;
    return apiRequest(url, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
};

// --- Data Store APIs ---
export async function getDataStore(dataStoreName: string, config: Config): Promise<DataStore> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1beta/${dataStoreName}`;
    return apiRequest<DataStore>(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export async function getDocument(documentName: string, config: Config): Promise<Document> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/${documentName}`;

    return apiRequest<Document>(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
}

export async function listDocuments(dataStoreName: string, config: Config): Promise<any> {
    const { accessToken, projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    // Documents are under the 'default_branch' of a data store
    const parent = `${dataStoreName}/branches/default_branch`;
    const url = `${baseUrl}/v1alpha/${parent}/documents`;

    return apiRequest(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Goog-User-Project': projectId,
        },
    });
}


// --- Discovery Resource Creation APIs ---
export const createCollection = async (collectionId: string, payload: { displayName: string }, config: Config) => {
    const { projectId, appLocation, accessToken } = config;
    const parent = `projects/${projectId}/locations/${appLocation}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/collections?collectionId=${collectionId}`;
    // This API returns a long-running operation
    const operation = await apiRequest<any>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(payload),
    });
    // For simplicity, we assume it completes fast enough for the next step. A robust implementation would poll.
    return operation;
};

export const createEngine = async (engineId: string, payload: object, config: Config) => {
    const { projectId, appLocation, collectionId, accessToken } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/engines?engineId=${engineId}`;
    const operation = await apiRequest<any>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(payload),
    });
    return operation;
};

export const createDataStore = async (dataStoreId: string, payload: object, config: Config) => {
    const { projectId, appLocation, collectionId, accessToken } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/dataStores?dataStoreId=${dataStoreId}`;
    const operation = await apiRequest<any>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(payload),
    });
    return operation;
};


export const createAssistant = async (assistantId: string, payload: { displayName: string }, config: Config) => {
    const { projectId, appLocation, collectionId, appId, accessToken } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}`;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${parent}/assistants?assistantId=${assistantId}`;
     const operation = await apiRequest<any>(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(payload),
    });
    return operation;
};

export const updateAssistant = async (assistantName: string, payload: Partial<Assistant>, updateMask: string[], config: Config): Promise<Assistant> => {
    const { projectId, appLocation, accessToken } = config;
    const url = `${getDiscoveryEngineUrl(appLocation)}/v1beta/${assistantName}?updateMask=${updateMask.join(',')}`;
    return apiRequest<Assistant>(url, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId },
        body: JSON.stringify(payload),
    });
};

// --- Discovery Resource Operation API ---
export const getDiscoveryOperation = async (operationName: string, config: Config): Promise<any> => {
    const { accessToken, projectId, appLocation } = config;
    // Operation name is a full resource path, like projects/{project}/locations/{location}/collections/.../operations/{id}
    // We can extract the location from the name, or fall back to the config's location
    const location = operationName.split('/')[3] || appLocation;
    const baseUrl = getDiscoveryEngineUrl(location);
    // The operation name is the full path from the version onwards.
    const url = `${baseUrl}/v1beta/${operationName}`;

    return apiRequest<any>(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Goog-User-Project': projectId,
        },
    });
};


// --- Reasoning Engine (AI Platform) APIs ---
export const getOperation = async (operationName: string, config: Config): Promise<any> => {
    const { accessToken, projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required for this operation.");

    const baseUrl = getAiPlatformUrl(reasoningEngineLocation).replace('/v1beta1', ''); // Get base without version
    const url = `${baseUrl}/v1beta1/${operationName}`;

    return apiRequest<any>(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Goog-User-Project': projectId,
        },
    });
};

export const listReasoningEngines = (config: Config) => {
    const { accessToken, projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const url = `${getAiPlatformUrl(reasoningEngineLocation)}/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    return apiRequest<{ reasoningEngines: ReasoningEngine[] }>(url, {
        method: "GET",
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Goog-User-Project': projectId },
    });
};

export const createReasoningEngine = async (engineData: { displayName: string }, config: Config): Promise<ReasoningEngine> => {
    const { reasoningEngineLocation, projectId, accessToken } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");

    const url = `${getAiPlatformUrl(reasoningEngineLocation)}/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;

    // This API returns a long-running operation
    const operation = await apiRequest<any>(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId,
        },
        body: JSON.stringify(engineData),
    });

    // Poll the operation until it's done
    let currentOperation = operation;
    while (!currentOperation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
        currentOperation = await getOperation(currentOperation.name, config);
    }

    if (currentOperation.error) {
        throw new Error(`Reasoning engine creation failed: ${currentOperation.error.message}`);
    }

    // The actual resource is in the 'response' field of the completed operation
    return currentOperation.response as ReasoningEngine;
};

export const deleteReasoningEngine = (engineName: string, config: Config) => {
    const { accessToken, projectId, reasoningEngineLocation } = config;
    if (!reasoningEngineLocation) throw new Error("Reasoning Engine Location is required.");
    const url = `${getAiPlatformUrl(reasoningEngineLocation)}/${engineName}`;
    return apiRequest(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            // FIX: Removed Content-Type header. DELETE requests should not have a body,
            // and this header can cause CORS preflight failures on some APIs like AI Platform.
            'X-Goog-User-Project': projectId,
        },
    });
};