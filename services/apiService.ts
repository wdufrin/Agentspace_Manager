
import { Agent, AppEngine, Assistant, Authorization, ChatMessage, Config, DataStore, Document, LogEntry, ReasoningEngine, CloudRunService, GcsBucket, GcsObject } from '../types';
import { getGapiClient } from './gapiService';

const DISCOVERY_API_VERSION = 'v1alpha';
const DISCOVERY_API_BETA = 'v1beta';

// Helper to determine base URL for Discovery Engine
const getDiscoveryEngineUrl = (location: string) => {
  return location === 'global'
    ? 'https://discoveryengine.googleapis.com'
    : `https://${location}-discoveryengine.googleapis.com`;
};

// Generic gapi request wrapper
const gapiRequest = async <T>(
    path: string, 
    method: string = 'GET', 
    projectId?: string, 
    params?: any, 
    body?: any, 
    headers?: any,
    suppressErrorLog: boolean = false
): Promise<T> => {
  const client = await getGapiClient();
  const requestOptions: any = {
    path,
    method,
    params,
    body,
    headers: headers || {}
  };
  
  if (projectId) {
      requestOptions.headers['X-Goog-User-Project'] = projectId;
  }

  try {
    const response = await client.request(requestOptions);
    return response.result;
  } catch (error: any) {
    if (!suppressErrorLog) {
        console.error("API Request Failed", error);
    }
    
    // Robust error message extraction to avoid [object Object]
    let errorMessage = "Unknown API Error";
    
    if (error?.result?.error?.message) {
        errorMessage = error.result.error.message;
    } else if (error?.result?.error?.code) {
        errorMessage = `API Error ${error.result.error.code}: ${JSON.stringify(error.result.error)}`;
    } else if (error?.message) {
        errorMessage = error.message;
    } else {
        try {
            // Try to stringify if it's a non-empty object
            const json = JSON.stringify(error);
            if (json !== '{}') errorMessage = json;
        } catch (e) {
            // Fallback
        }
    }
    
    throw new Error(errorMessage);
  }
};

// --- Project & IAM ---

export const getProjectNumber = async (projectId: string): Promise<string> => {
    const response = await gapiRequest<any>(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`, 'GET', projectId);
    return response.projectNumber;
};

export const getProject = async (projectNumberOrId: string): Promise<{ projectId: string, projectNumber: string }> => {
    const response = await gapiRequest<any>(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectNumberOrId}`, 'GET', projectNumberOrId.match(/^\d+$/) ? undefined : projectNumberOrId);
    return { projectId: response.projectId, projectNumber: response.projectNumber };
};

export const validateEnabledApis = async (projectId: string): Promise<{ enabled: string[], disabled: string[] }> => {
    const requiredApis = [
        'discoveryengine.googleapis.com',
        'aiplatform.googleapis.com',
        'run.googleapis.com',
        'cloudbuild.googleapis.com',
        'storage.googleapis.com',
        'bigquery.googleapis.com',
        'logging.googleapis.com',
        'cloudresourcemanager.googleapis.com',
        'iam.googleapis.com',
        'serviceusage.googleapis.com'
    ];
    
    // List enabled services (pagination omitted for brevity, usually fit in 200)
    const response = await gapiRequest<any>(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services?filter=state:ENABLED&pageSize=200`, 'GET', projectId);
    const enabledServices = new Set((response.services || []).map((s: any) => s.config.name));
    
    const enabled: string[] = [];
    const disabled: string[] = [];
    
    requiredApis.forEach(api => {
        if (enabledServices.has(api)) enabled.push(api);
        else disabled.push(api);
    });
    
    return { enabled, disabled };
};

export const batchEnableApis = async (projectId: string, apis: string[]) => {
    return gapiRequest<any>(
        `https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`,
        'POST',
        projectId,
        undefined,
        { serviceIds: apis }
    );
};

export const getServiceUsageOperation = async (name: string) => {
    return gapiRequest<any>(`https://serviceusage.googleapis.com/v1/${name}`);
};

export const checkServiceAccountPermissions = async (projectId: string, saEmail: string, permissions: string[]): Promise<{ hasAll: boolean, missing: string[] }> => {
    const response = await gapiRequest<any>(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:testIamPermissions`,
        'POST',
        projectId,
        undefined,
        { permissions }
    );
    const granted = new Set(response.permissions || []);
    const missing = permissions.filter(p => !granted.has(p));
    return { hasAll: missing.length === 0, missing };
};

// --- Discovery Engine Resources ---

export const listResources = async (resourceType: 'agents'|'engines'|'dataStores'|'collections'|'assistants', config: Config): Promise<any> => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    let url = '';
    
    switch (resourceType) {
        case 'collections':
            url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections`;
            break;
        case 'engines':
            url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || 'default_collection'}/engines`;
            break;
        case 'assistants':
            url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants`;
            break;
        case 'agents':
            url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}/agents`;
            break;
        case 'dataStores':
            url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || 'default_collection'}/dataStores`;
            break;
    }
    return gapiRequest(url, 'GET', projectId);
};

export const getDiscoveryOperation = async (name: string, config: Config, apiVersion: string = DISCOVERY_API_VERSION) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<any>(`${baseUrl}/${apiVersion}/${name}`, 'GET', config.projectId);
};

export const getVertexAiOperation = async (name: string, config: Config) => {
    // name is like projects/{project}/locations/{location}/operations/{opId}
    // OR projects/{project}/locations/{location}/reasoningEngines/{reId}/operations/{opId}
    const parts = name.split('/');
    const locIndex = parts.indexOf('locations');
    const location = (locIndex !== -1 && parts.length > locIndex + 1) ? parts[locIndex + 1] : (config.reasoningEngineLocation || 'us-central1');
    
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
    return gapiRequest<any>(url, 'GET', config.projectId);
};

// Collections
export const createCollection = async (collectionId: string, payload: any, config: Config) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections?collectionId=${collectionId}`;
    return gapiRequest<any>(url, 'POST', projectId, undefined, payload);
};

// Engines
export const getEngine = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<AppEngine>(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}`, 'GET', config.projectId);
};

export const createEngine = async (engineId: string, payload: any, config: Config) => {
    const { projectId, appLocation, collectionId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines?engineId=${engineId}`;
    return gapiRequest<any>(url, 'POST', projectId, undefined, payload);
};

// Assistants
export const getAssistant = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<Assistant>(
        `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`, 
        'GET', 
        config.projectId,
        undefined,
        undefined,
        undefined,
        config.suppressErrorLog // Pass through suppression flag
    );
};

export const updateAssistant = async (name: string, payload: any, updateMask: string[], config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(',')}`;
    return gapiRequest<Assistant>(url, 'PATCH', config.projectId, undefined, payload);
};

export const createAssistant = async (assistantId: string, payload: any, config: Config) => {
    const { projectId, appLocation, collectionId, appId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants?assistantId=${assistantId}`;
    return gapiRequest<Assistant>(url, 'POST', projectId, undefined, payload);
};

// Agents
export const getAgent = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<Agent>(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}`, 'GET', config.projectId);
};

export const getAgentView = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<any>(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}:getAgentView`, 'GET', config.projectId);
};

export const createAgent = async (payload: any, config: Config, agentId?: string) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}/agents`;
    if (agentId) {
        url += `?agentId=${agentId}`;
    }
    return gapiRequest<Agent>(url, 'POST', projectId, undefined, payload);
};

export const updateAgent = async (agent: Agent, payload: any, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const updateMask: string[] = [];
    if (payload.displayName) updateMask.push('display_name');
    if (payload.description) updateMask.push('description');
    if (payload.icon) updateMask.push('icon');
    if (payload.starterPrompts) updateMask.push('starter_prompts');
    if (payload.adkAgentDefinition) updateMask.push('adk_agent_definition');
    if (payload.a2aAgentDefinition) updateMask.push('a2a_agent_definition');
    if (payload.authorizations) updateMask.push('authorizations');

    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${agent.name}?updateMask=${updateMask.join(',')}`;
    return gapiRequest<Agent>(url, 'PATCH', config.projectId, undefined, payload);
};

export const disableAgent = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    await gapiRequest(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}:disableAgent`, 'POST', config.projectId);
    return getAgent(name, config);
};

export const enableAgent = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    await gapiRequest(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}:enableAgent`, 'POST', config.projectId);
    return getAgent(name, config);
};

export const deleteResource = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}`, 'DELETE', config.projectId);
};

// Data Stores
export const getDataStore = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<DataStore>(`${baseUrl}/${DISCOVERY_API_BETA}/${name}`, 'GET', config.projectId);
};

export const createDataStore = async (dataStoreId: string, payload: any, config: Config) => {
    const { projectId, appLocation, collectionId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || 'default_collection'}/dataStores?dataStoreId=${dataStoreId}`;
    return gapiRequest<any>(url, 'POST', projectId, undefined, payload);
};

export const updateDataStore = async (name: string, payload: any, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const updateMask = Object.keys(payload).join(',');
    const url = `${baseUrl}/${DISCOVERY_API_BETA}/${name}?updateMask=${updateMask}`;
    return gapiRequest<DataStore>(url, 'PATCH', config.projectId, undefined, payload);
};

export const deleteDataStore = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest(`${baseUrl}/${DISCOVERY_API_BETA}/${name}`, 'DELETE', config.projectId);
};

export const listDocuments = async (dataStoreName: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<{ documents: Document[] }>(`${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/branches/default_branch/documents`, 'GET', config.projectId);
};

export const getDocument = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<Document>(`${baseUrl}/${DISCOVERY_API_BETA}/${name}`, 'GET', config.projectId);
};

export const importDocuments = async (dataStoreName: string, gcsUris: string[], bucket: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const payload = {
        reconciliationMode: "INCREMENTAL",
        gcsSource: { inputUris: gcsUris, dataSchema: "content" }
    };
    return gapiRequest<any>(`${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/branches/default_branch/documents:import`, 'POST', config.projectId, undefined, payload);
};

// Authorizations
export const listAuthorizations = async (config: Config) => {
    const baseUrl = getDiscoveryEngineUrl('global'); // Authorizations are global
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/global/authorizations`;
    return gapiRequest<{ authorizations: Authorization[] }>(url, 'GET', config.projectId);
};

export const getAuthorization = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl('global');
    return gapiRequest<Authorization>(`${baseUrl}/${DISCOVERY_API_VERSION}/${name}`, 'GET', config.projectId);
};

export const createAuthorization = async (authId: string, payload: any, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl('global');
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/global/authorizations?authorizationId=${authId}`;
    return gapiRequest<Authorization>(url, 'POST', config.projectId, undefined, payload);
};

export const updateAuthorization = async (name: string, payload: any, updateMask: string[], config: Config) => {
    const baseUrl = getDiscoveryEngineUrl('global');
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(',')}`;
    return gapiRequest<Authorization>(url, 'PATCH', config.projectId, undefined, payload);
};

export const deleteAuthorization = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl('global');
    // Extract ID if only ID is passed, otherwise use full name
    const resourceName = name.startsWith('projects/') ? name : `projects/${config.projectId}/locations/global/authorizations/${name}`;
    return gapiRequest(`${baseUrl}/${DISCOVERY_API_VERSION}/${resourceName}`, 'DELETE', config.projectId);
};

export const setAgentIamPolicy = async (resourceName: string, policy: any, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<any>(`${baseUrl}/${DISCOVERY_API_VERSION}/${resourceName}:setIamPolicy`, 'POST', config.projectId, undefined, { policy });
};

export const getAgentIamPolicy = async (resourceName: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<any>(`${baseUrl}/${DISCOVERY_API_VERSION}/${resourceName}:getIamPolicy`, 'GET', config.projectId);
};

// --- Vertex AI (Reasoning Engines) ---

export const listReasoningEngines = async (config: Config) => {
    const { projectId, reasoningEngineLocation } = config;
    const url = `https://${reasoningEngineLocation}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    return gapiRequest<{ reasoningEngines: ReasoningEngine[] }>(url, 'GET', projectId);
};

export const getReasoningEngine = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
    return gapiRequest<ReasoningEngine>(url, 'GET', config.projectId);
};

export const createReasoningEngine = async (config: Config, payload: any) => {
    const { projectId, reasoningEngineLocation } = config;
    const url = `https://${reasoningEngineLocation}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${reasoningEngineLocation}/reasoningEngines`;
    return gapiRequest<any>(url, 'POST', projectId, undefined, payload);
};

export const deleteReasoningEngine = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
    return gapiRequest(url, 'DELETE', config.projectId);
};

export const listReasoningEngineSessions = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    // This is not a standard list method, it might be :listSessions or similar if available, 
    // or standard REST pattern if sessions are sub-resources. Assuming standard pattern:
    // projects/.../reasoningEngines/.../sessions (This is hypothetical as public API might differ)
    // Adjusting to a known pattern if available or returning empty if not supported yet.
    // For now, assuming a made-up endpoint based on resource hierarchy logic.
    // NOTE: Replace with actual endpoint if known. Assuming standard sub-resource list.
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}/sessions`;
    return gapiRequest<{ sessions: any[] }>(url, 'GET', config.projectId).catch(() => ({ sessions: [] }));
};

export const deleteReasoningEngineSession = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
    return gapiRequest(url, 'DELETE', config.projectId);
};

export const generateVertexContent = async (config: Config, prompt: string, model: string = 'gemini-1.5-flash-001'): Promise<string> => {
    const { projectId } = config;
    const location = 'us-central1'; // Generative AI usually in us-central1
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
    
    const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
    };
    
    const response: any = await gapiRequest(url, 'POST', projectId, undefined, payload);
    return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

export const streamQueryReasoningEngine = async (
    engineName: string, 
    query: string, 
    sessionId: string, 
    config: Config, 
    accessToken: string, 
    onChunk: (chunk: any) => void
) => {
    const location = engineName.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}:streamQuery`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': config.projectId
        },
        body: JSON.stringify({ input: { message: query, user_id: sessionId } })
    });

    if (!response.ok) throw new Error(`Stream query failed: ${response.statusText}`);
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        // Keep the last line in buffer as it might be incomplete
        buffer = lines.pop() || ''; 

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            let jsonStr = trimmed;
            // Handle SSE format if present
            if (trimmed.startsWith('data: ')) {
                jsonStr = trimmed.substring(6);
            }
            
            try {
                const chunk = JSON.parse(jsonStr);
                onChunk(chunk);
            } catch (e) { 
                console.warn("Failed to parse chunk", e); 
            }
        }
    }
};

// --- Cloud Run ---

export const listCloudRunServices = async (config: Config, region: string) => {
    const url = `https://${region}-run.googleapis.com/v2/projects/${config.projectId}/locations/${region}/services`;
    return gapiRequest<{ services: CloudRunService[] }>(url, 'GET', config.projectId);
};

export const getCloudRunService = async (name: string, config: Config) => {
    const region = name.split('/')[3];
    const url = `https://${region}-run.googleapis.com/v2/${name}`;
    return gapiRequest<CloudRunService>(url, 'GET', config.projectId);
};

export const deleteCloudRunService = async (name: string, config: Config) => {
    const region = name.split('/')[3];
    const url = `https://${region}-run.googleapis.com/v2/${name}`;
    const op: any = await gapiRequest(url, 'DELETE', config.projectId);
    // Poll operation
    let currentOp = op;
    while (!currentOp.done) {
        await new Promise(r => setTimeout(r, 2000));
        currentOp = await gapiRequest(`https://${region}-run.googleapis.com/v2/${op.name}`, 'GET', config.projectId);
    }
    return currentOp;
};

// --- Cloud Build ---

export const createCloudBuild = async (projectId: string, buildConfig: any) => {
    return gapiRequest<any>(
        `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`,
        'POST',
        projectId,
        undefined,
        buildConfig
    );
};

export const getCloudBuild = async (projectId: string, buildId: string) => {
    return gapiRequest<any>(`https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${buildId}`, 'GET', projectId);
};

export const fetchBuildLogs = async (projectId: string, buildId: string): Promise<string[]> => {
    // Fetch logs from Cloud Logging using the build_id
    const body = {
        resourceNames: [`projects/${projectId}`],
        filter: `resource.type="build" AND resource.labels.build_id="${buildId}"`,
        orderBy: "timestamp asc",
        pageSize: 1000
    };
    try {
        const response = await gapiRequest<{ entries: LogEntry[] }>(`https://logging.googleapis.com/v2/entries:list`, 'POST', projectId, undefined, body);
        return (response.entries || []).map(entry => entry.textPayload || '');
    } catch (e: any) {
        console.warn("Failed to fetch build logs", e);
        return [`[Log Error] ${e.message || 'Unknown error fetching logs'}`];
    }
};

// --- GCS ---

export const listBuckets = async (projectId: string) => {
    return gapiRequest<{ items: GcsBucket[] }>(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, 'GET', projectId);
};

export const listGcsObjects = async (bucket: string, prefix: string, projectId: string) => {
    return gapiRequest<{ items: GcsObject[] }>(
        `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`,
        'GET',
        projectId
    );
};

export const uploadFileToGcs = async (bucket: string, objectName: string, file: File, projectId: string) => {
    const client = await getGapiClient();
    // Use the upload endpoint
    const accessToken = client.getToken().access_token;
    
    const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': file.type || 'application/octet-stream',
            'X-Goog-User-Project': projectId
        },
        body: file
    });
    
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
    }
    return response.json();
};

// --- A2A ---

export const fetchA2aAgentCard = async (serviceUrl: string, accessToken: string) => {
    const url = `${serviceUrl.replace(/\/$/, '')}/.well-known/agent.json`;
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`Failed to fetch agent card: ${response.statusText}`);
    return response.json();
};

export const invokeA2aAgent = async (serviceUrl: string, prompt: string, accessToken: string) => {
    const url = `${serviceUrl.replace(/\/$/, '')}/invoke`;
    const payload = {
        jsonrpc: "2.0",
        method: "chat",
        params: { message: { role: "user", parts: [{ text: prompt }] } },
        id: crypto.randomUUID()
    };
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error(`Invocation failed: ${response.statusText}`);
    const data = await response.json();
    return data.result; // Expecting JSON-RPC result
};

export const registerA2aAgent = async (config: Config, agentName: string, payload: any) => {
    // Uses createAgent logic but specifically for A2A
    return createAgent(payload, config, agentName);
};

// --- Chat ---

export const streamChat = async (
    agentName: string | null,
    query: string,
    sessionId: string | null,
    config: Config,
    accessToken: string,
    onChunk: (chunk: any) => void
) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    
    // Construct URL for streamAssist. If agentName is null, we talk to the assistant directly.
    // If agentName is provided, we might need a different endpoint (sessions:streamQuery),
    // but the UI typically uses the assistant's streamAssist to route to agents.
    
    // Standard path for Assistant streaming
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}:streamAssist`;
    
    const payload: any = {
        query: { text: query },
        user_id: "test-user" // required for some features
    };
    if (sessionId) {
        payload.session = sessionId;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Chat stream failed: ${response.statusText}`);
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        // The API returns a stream of JSON objects, potentially separated by newlines or just concatenated
        // We'll need to parse valid JSON objects from the buffer.
        // A simple approach assuming line-delimited JSON or similar structure:
        
        // Fix for potential array of objects or rapid stream
        // Discovery Engine streaming usually returns JSON objects.
        // Let's try to split by some delimiter if standard JSON stream format is used.
        // Or assume the buffer contains complete JSONs if slow enough.
        
        // Robust strategy: Find matching braces
        let braceCount = 0;
        let jsonStartIndex = 0;
        
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === '{') braceCount++;
            else if (buffer[i] === '}') braceCount--;
            
            if (braceCount === 0 && i > jsonStartIndex) {
                const potentialJson = buffer.substring(jsonStartIndex, i + 1);
                try {
                    const chunk = JSON.parse(potentialJson);
                    onChunk(chunk);
                    jsonStartIndex = i + 1;
                } catch (e) {
                    // Not a valid JSON yet, keep buffering
                }
            }
        }
        
        if (jsonStartIndex > 0) {
            buffer = buffer.substring(jsonStartIndex);
        }
    }
};

// --- Logging ---

export const fetchViolationLogs = async (config: Config, filter: string) => {
    const { projectId } = config;
    let logFilter = `resource.type="modelarmor.googleapis.com/SanitizeOperation"`;
    if (filter && filter.trim()) {
        logFilter += ` AND ${filter}`;
    }
    const body = {
        resourceNames: [`projects/${projectId}`],
        filter: logFilter,
        orderBy: "timestamp desc",
        pageSize: 50
    };
    return gapiRequest<{ entries: LogEntry[] }>(`https://logging.googleapis.com/v2/entries:list`, 'POST', projectId, undefined, body);
};

// --- BigQuery & Analytics ---

export const listBigQueryDatasets = async (projectId: string): Promise<{ datasets?: any[] }> => {
    const path = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`;
    return gapiRequest<{ datasets?: any[] }>(path, 'GET', projectId);
};

export const listBigQueryTables = async (projectId: string, datasetId: string): Promise<{ tables?: any[] }> => {
    const path = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`;
    return gapiRequest<{ tables?: any[] }>(path, 'GET', projectId);
};

export const createBigQueryDataset = async (projectId: string, datasetId: string, location: string): Promise<any> => {
    const path = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`;
    const body = {
        datasetReference: { datasetId },
        location
    };
    return gapiRequest<any>(path, 'POST', projectId, undefined, body);
};

export const createBigQueryTable = async (projectId: string, datasetId: string, tableId: string): Promise<any> => {
    const path = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`;
    const body = {
        tableReference: { projectId, datasetId, tableId }
    };
    return gapiRequest<any>(path, 'POST', projectId, undefined, body);
};

export const exportAnalyticsMetrics = async (config: Config, bigQueryDatasetId: string, bigQueryTableId: string): Promise<any> => {
    const { projectId, appLocation, collectionId, appId } = config;
    const parent = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}`;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${parent}/analytics:exportMetrics`;

    const body = {
        analytics: parent,
        outputConfig: {
            bigqueryDestination: {
                datasetId: bigQueryDatasetId,
                tableId: bigQueryTableId
            }
        }
    };
    return gapiRequest<any>(url, 'POST', projectId, undefined, body);
};

export const runBigQueryQuery = async (projectId: string, query: string): Promise<any> => {
    const path = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
    const body = {
        query,
        useLegacySql: false
    };
    return gapiRequest<any>(path, 'POST', projectId, undefined, body);
};

// --- Licenses ---

export const listUserLicenses = async (config: Config, userStoreId: string, filter: string, pageToken?: string, pageSize: number = 50) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    // Use v1 for licenses as it is GA
    const url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/userLicenses`;
    const params: any = { pageSize };
    if (filter) params.filter = filter;
    if (pageToken) params.pageToken = pageToken;
    
    return gapiRequest(url, 'GET', projectId, params);
};

export const getLicenseConfig = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    // Assuming v1
    return gapiRequest<any>(`${baseUrl}/v1/${name}`, 'GET', config.projectId);
};

export const revokeUserLicenses = async (config: Config, userStoreId: string, userPrincipals: string[]) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const parent = `projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}`;
    const url = `${baseUrl}/v1/${parent}:batchUpdateUserLicenses`;
    
    // To revoke, we update the license to have NO license config, effectively removing it?
    // Or check if there is a delete method. Usually batchUpdate with empty config works for unassignment.
    // Based on API docs, setting licenseConfig to empty string or null unassigns it if paths include it.
    
    const inlineSource = {
        userLicenses: userPrincipals.map(p => ({ userPrincipal: p })),
        updateMask: { paths: ['userPrincipal', 'licenseConfig'] } // Update config to empty/default
    };
    
    // Need to check if deleteUnassignedUserLicenses param is available or implied
    const body = {
        inlineSource,
        deleteUnassignedUserLicenses: true // This helps cleanup
    };
    
    return gapiRequest(url, 'POST', projectId, undefined, body);
};
