
import { Agent, AppEngine, Assistant, Authorization, ChatMessage, Config, DataStore, Document, LogEntry, ReasoningEngine, CloudRunService, GcsBucket, GcsObject, DialogflowAgent } from '../types';
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
    
    // Try to extract from gapi result error structure
    if (error?.result?.error?.message) {
        errorMessage = error.result.error.message;
    } 
    // Try to extract from top-level error message
    else if (error?.message) {
        errorMessage = error.message;
    } 
    // Otherwise, stringify the whole response result for maximum visibility
    else if (error?.result) {
        errorMessage = JSON.stringify(error.result, null, 2);
    }
    // Fallback to stringifying the error object itself
    else if (typeof error === 'object' && error !== null) {
        try {
            errorMessage = JSON.stringify(error.result, null, 2);
        } catch (e) {
            errorMessage = "Complex Error Object (cannot stringify)";
        }
    } else if (error) {
        errorMessage = String(error);
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
        'serviceusage.googleapis.com',
        'dialogflow.googleapis.com'
    ];
    
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

// FIX: Added missing createCollection function.
export const createCollection = async (collectionId: string, payload: any, config: Config) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections?collectionId=${collectionId}`;
    return gapiRequest<any>(url, 'POST', projectId, undefined, payload);
};

export const getDiscoveryOperation = async (name: string, config: Config, apiVersion: string = DISCOVERY_API_VERSION) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    return gapiRequest<any>(`${baseUrl}/${apiVersion}/${name}`, 'GET', config.projectId);
};

export const getVertexAiOperation = async (name: string, config: Config) => {
    const parts = name.split('/');
    const locIndex = parts.indexOf('locations');
    const location = (locIndex !== -1 && parts.length > locIndex + 1) ? parts[locIndex + 1] : (config.reasoningEngineLocation || 'us-central1');
    
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
    return gapiRequest<any>(url, 'GET', config.projectId);
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

export const updateEngine = async (name: string, payload: any, updateMask: string[], config: Config) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(',')}`;
    return gapiRequest<AppEngine>(url, 'PATCH', projectId, undefined, payload);
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
        config.suppressErrorLog
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

export const shareAgent = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const flatName = name.replace('/assistants/default_assistant', '');
    await gapiRequest(`${baseUrl}/${DISCOVERY_API_VERSION}/${flatName}:share`, 'POST', config.projectId);
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
    const baseUrl = getDiscoveryEngineUrl('global');
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

export const deleteAuthorization = async (authId: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl('global');
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/global/authorizations/${authId}`;
    return gapiRequest(url, 'DELETE', config.projectId);
};

// Vertex AI Reasoning Engines
export const listReasoningEngines = async (config: Config) => {
    const location = config.reasoningEngineLocation || 'us-central1';
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/reasoningEngines`;
    return gapiRequest<{ reasoningEngines: ReasoningEngine[] }>(url, 'GET', config.projectId);
};

export const getReasoningEngine = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
    return gapiRequest<ReasoningEngine>(url, 'GET', config.projectId);
};

export const createReasoningEngine = async (config: Config, payload: any) => {
    const location = config.reasoningEngineLocation || 'us-central1';
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/reasoningEngines`;
    return gapiRequest<any>(url, 'POST', config.projectId, undefined, payload);
};

export const deleteReasoningEngine = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    // IMPORTANT: Added force=true to automatically handle child resources (sessions) as requested by the API error message.
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}?force=true`;
    return gapiRequest(url, 'DELETE', config.projectId);
};

export const listReasoningEngineSessions = async (engineName: string, config: Config) => {
    const location = engineName.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}/sessions`;
    return gapiRequest<{ sessions: { name: string }[] }>(url, 'GET', config.projectId);
};

export const deleteReasoningEngineSession = async (sessionName: string, config: Config) => {
    const location = sessionName.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${sessionName}`;
    return gapiRequest(url, 'DELETE', config.projectId);
};

// Stream Assist API
export const streamChat = async (agentName: string | null, query: string, sessionId: string | null, config: Config, accessToken: string, onChunk: (chunk: any) => void, toolsSpec?: any) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}:streamAssist`;

    const body: any = {
        query: { text: query },
        toolsSpec: toolsSpec
    };
    if (sessionId) {
        body.session = sessionId;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Chat API Faied", { status: response.status, statusText: response.statusText, url, body, errorText });
        throw new Error(`Chat API Error: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}...`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let braceBalance = 0;
    let inString = false;
    let isEscaped = false;

    while (true) {
        const { done, value } = await reader.read();
        const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });

        for (const char of chunk) {
            buffer += char;

            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === '\\') {
                isEscaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') {
                    braceBalance++;
                } else if (char === '}') {
                    braceBalance--;
                    // Balance returns to zero: potentially a complete top-level object
                    if (braceBalance === 0) {
                        try {
                            // Find the last opening brace that started this object
                            // Actually, if we track balance from 0, the entire buffer (trimmed) might be the object if we reset buffer on success.
                            // But since the stream might contain commas or brackets between objects (e.g. "[{...}, {...}]"), we need to be careful.
                            // Simple approach: Try to parse the accumulated buffer if it looks like an object.

                            // Remove leading comma or bracket if present and strictly matching an object
                            let cleanBuffer = buffer.trim();
                            // If it starts with ',' or '[', strip them for checking but we need to be careful not to strip valid parts if we are inside...
                            // Actually, robust way: Find first '{'
                            const firstBrace = cleanBuffer.indexOf('{');
                            if (firstBrace !== -1) {
                                const jsonCandidate = cleanBuffer.substring(firstBrace);
                                // verify ends with '}'
                                if (jsonCandidate.endsWith('}')) {
                                    const chunk = JSON.parse(jsonCandidate);
                                    onChunk(chunk);
                                    buffer = ''; // Reset buffer on success
                                }
                            }
                        } catch (e) {
                            // It might be that we haven't reached the REAL end yet if braces were mismatched in logic, or standard parse error.
                            // But with brace counting, we should be at a boundary.
                            // If parse fails, we might want to keep accumulating? 
                            // No, if balance is 0, we MUST have finished a potential block. 
                            // If it fails, it's likely garbage or we need to respect the array structure more.
                            // For this logic, we assume top-level objects are what we want.
                            console.warn("Could not parse chat chunk via brace counting", e);
                            // We don't reset buffer here? If we don't, we might append next object to this garbage.
                            // Safest is to reset if we really think we hit a boundary, OR try to recover.
                            // Let's reset to avoid infinite buffer growth.
                            buffer = '';
                        }
                    }
                }
            }
        }
        if (done) break;
    }
};

// Stream Query API (Direct Reasoning Engine Query)
export const streamQueryReasoningEngine = async (engineName: string, query: string, userId: string, config: Config, accessToken: string, onChunk: (chunk: any) => void) => {
    const { projectId } = config;
    const location = engineName.split('/')[3];
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}:streamQuery`;

    const body = {
        input: {
            message: query,
            user_id: userId
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': projectId
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reasoning Engine Stream API Error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

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
                const chunk = JSON.parse(line);
                onChunk(chunk);
            } catch (e) {
                console.warn("Could not parse query chunk", line);
            }
        }
    }
};

// Generate Vertex Content (AI Helpers) with robust stream parsing
export const generateVertexContent = async (config: Config, prompt: string, model: string = 'gemini-2.5-flash') => {
    const location = 'us-central1';
    const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/publishers/google/models/${model}:streamGenerateContent`;
    
    const client = await getGapiClient();
    const token = client.getToken().access_token;

    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Vertex AI Error: ${response.status} - ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let braceBalance = 0;
    let inString = false;
    let isEscaped = false;

    while (true) {
        const { done, value } = await reader.read();
        const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });

        for (const char of chunk) {
            buffer += char;

            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === '\\') {
                isEscaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') {
                    braceBalance++;
                } else if (char === '}') {
                    braceBalance--;
                    if (braceBalance === 0) {
                        // Potential complete object found at top level (chunks are usually arrays of objects, but here we might get individual objects or the array wrapper)
                        // Vertex streamGenerateContent returns a stream of Parseable JSON objects like [{...}] or just {...} depending on API version/format.
                        // Actually, Vertex returns an array structure `[`, then Objects `{...},`, then `]`.
                        // But brace counting logic is mainly for finding the `{...}` objects.

                        try {
                            const trimmed = buffer.trim();
                            // If it starts with ',' or '[' we might need to be careful.
                            // Simple heuristic: Try to find the first '{'
                            const firstBrace = trimmed.indexOf('{');
                            if (firstBrace !== -1) {
                                const candidate = trimmed.substring(firstBrace);
                                if (candidate.endsWith('}')) {
                                    const json = JSON.parse(candidate);
                                    // Extract text from the candidate object
                                    const part = json.candidates?.[0]?.content?.parts?.[0];
                                    if (part?.text) fullText += part.text;

                                    buffer = ''; // Reset buffer on success
                                }
                            }
                        } catch (e) {
                            // Keep buffering if parse fails
                        }
                    }
                }
            }
        }
        if (done) break;
    }
    return fullText;
};

// --- Cloud Run Services ---

export const listCloudRunServices = async (config: Config, region: string) => {
    const url = `https://${region}-run.googleapis.com/v2/projects/${config.projectId}/locations/${region}/services`;
    return gapiRequest<any>(url, 'GET', config.projectId);
};

export const getCloudRunService = async (name: string, config: Config) => {
    const region = name.split('/')[3];
    const url = `https://${region}-run.googleapis.com/v2/${name}`;
    return gapiRequest<CloudRunService>(url, 'GET', config.projectId);
};

export const deleteCloudRunService = async (name: string, config: Config) => {
    const region = name.split('/')[3];
    const url = `https://${region}-run.googleapis.com/v2/${name}`;
    return gapiRequest<any>(url, 'DELETE', config.projectId);
};

// --- GCS ---

export const listBuckets = async (projectId: string) => {
    return gapiRequest<any>(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, 'GET', projectId);
};

export const listGcsObjects = async (bucket: string, prefix: string, projectId: string) => {
    let url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o`;
    if (prefix) url += `?prefix=${encodeURIComponent(prefix)}`;
    return gapiRequest<any>(url, 'GET', projectId);
};

export const getGcsObjectContent = async (bucket: string, objectName: string, projectId: string) => {
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`;
    const client = await getGapiClient();
    const response = await client.request({ path: url, method: 'GET', headers: { 'X-Goog-User-Project': projectId } });
    return typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
};

export const uploadFileToGcs = async (bucket: string, objectName: string, file: File | Blob, projectId: string) => {
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
    const client = await getGapiClient();
    const token = client.getToken().access_token;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'X-Goog-User-Project': projectId,
            'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
    });
    
    if (!response.ok) {
        throw new Error(`GCS Upload Failed: ${response.status} - ${await response.text()}`);
    }
    return response.json();
};

// --- Cloud Build ---

export const createCloudBuild = async (projectId: string, buildConfig: any) => {
    return gapiRequest<any>(`https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`, 'POST', projectId, undefined, buildConfig);
};

export const getCloudBuild = async (projectId: string, buildId: string) => {
    return gapiRequest<any>(`https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${buildId}`, 'GET', projectId);
};

export const fetchBuildLogs = async (projectId: string, buildId: string): Promise<string[]> => {
    try {
        const build = await getCloudBuild(projectId, buildId);
        const logUri = build.logUrl; // This is a web console URL, not the direct log access
        // Direct log access is via Cloud Logging for newer builds
        const filter = `resource.type="build" AND resource.labels.build_id="${buildId}"`;
        const res = await gapiRequest<any>(`https://logging.googleapis.com/v2/entries:list`, 'POST', projectId, undefined, {
            resourceNames: [`projects/${projectId}`],
            filter: filter,
            orderBy: "timestamp asc",
            pageSize: 1000
        });
        return (res.entries || []).map((e: any) => e.textPayload || JSON.stringify(e.jsonPayload || e.protoPayload));
    } catch (e) {
        console.warn("Failed to fetch build logs", e);
        return ["Logging not available yet or permission denied."];
    }
};

// --- BigQuery ---

export const listBigQueryDatasets = async (projectId: string) => {
    return gapiRequest<any>(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`, 'GET', projectId);
};

export const createBigQueryDataset = async (projectId: string, datasetId: string, location: string = 'US') => {
    const body = {
        datasetReference: { datasetId, projectId },
        location
    };
    return gapiRequest<any>(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`, 'POST', projectId, undefined, body);
};

export const listBigQueryTables = async (projectId: string, datasetId: string) => {
    return gapiRequest<any>(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`, 'GET', projectId);
};

export const createBigQueryTable = async (projectId: string, datasetId: string, tableId: string) => {
    const body = {
        tableReference: { tableId, datasetId, projectId }
    };
    return gapiRequest<any>(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`, 'POST', projectId, undefined, body);
};

export const runBigQueryQuery = async (projectId: string, query: string) => {
    return gapiRequest<any>(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`, 'POST', projectId, undefined, { query, useLegacySql: false });
};

// --- Logging ---

export const fetchViolationLogs = async (config: Config, customFilter: string = '') => {
    const filter = `resource.type="modelarmor.googleapis.com/SanitizeOperation" ${customFilter ? 'AND ' + customFilter : ''}`;
    return gapiRequest<any>(`https://logging.googleapis.com/v2/entries:list`, 'POST', config.projectId, undefined, {
        resourceNames: [`projects/${config.projectId}`],
        filter: filter,
        orderBy: "timestamp desc",
        pageSize: 50
    });
};

// --- Dialogflow CX ---

export const listDialogflowAgents = async (config: Config) => {
    const location = config.reasoningEngineLocation || 'us-central1';
    const url = `https://${location}-dialogflow.googleapis.com/v3/projects/${config.projectId}/locations/${location}/agents`;
    return gapiRequest<any>(url, 'GET', config.projectId);
};

export const deleteDialogflowAgent = async (name: string, config: Config) => {
    const location = name.split('/')[3];
    const url = `https://${location}-dialogflow.googleapis.com/v3/${name}`;
    return gapiRequest<any>(url, 'DELETE', config.projectId);
};

export const detectDialogflowIntent = async (agentName: string, query: string, sessionId: string, config: Config, accessToken: string) => {
    const location = agentName.split('/')[3];
    const sessionPath = `${agentName}/sessions/${sessionId}`;
    const url = `https://${location}-dialogflow.googleapis.com/v3/${sessionPath}:detectIntent`;
    
    const body = {
        queryInput: {
            text: { text: query },
            languageCode: "en"
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Goog-User-Project': config.projectId
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Dialogflow DetectIntent Error: ${response.status} - ${await response.text()}`);
    }
    return response.json();
};

// --- IAM Helper for Agents ---

export const getAgentIamPolicy = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:getIamPolicy`;
    return gapiRequest<any>(url, 'GET', config.projectId);
};

export const setAgentIamPolicy = async (name: string, policy: any, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:setIamPolicy`;
    return gapiRequest<any>(url, 'POST', config.projectId, undefined, { policy });
};

// --- Assistant Export/Metrics ---

export const exportAnalyticsMetrics = async (config: Config, datasetId: string, tableId: string) => {
    const { projectId, appLocation, collectionId, appId, assistantId } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}:exportAnalyticsMetrics`;
    
    const body = {
        bigqueryDestination: {
            tableUri: `bq://${projectId}.${datasetId}.${tableId}`
        },
        filter: "timestamp >= \"30 days ago\"" // Example filter
    };
    return gapiRequest<any>(url, 'POST', projectId, undefined, body);
};

export const getLicenseConfig = async (name: string, config: Config) => {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const url = `${baseUrl}/v1/${name}`;
    return gapiRequest<any>(url, 'GET', config.projectId);
};

export const listUserLicenses = async (config: Config, userStoreId: string, filter?: string, pageToken?: string, pageSize: number = 20) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    let url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/userLicenses?pageSize=${pageSize}`;
    if (filter) url += `&filter=${encodeURIComponent(filter)}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    return gapiRequest<any>(url, 'GET', projectId);
};

export const revokeUserLicenses = async (config: Config, userStoreId: string, userPrincipals: string[]) => {
    const { projectId, appLocation } = config;
    const baseUrl = getDiscoveryEngineUrl(appLocation);
    const url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}:batchUpdateUserLicenses`;
    
    const body = {
        inlineSource: {
            userLicenses: userPrincipals.map(p => ({ userPrincipal: p })),
            updateMask: { paths: ["userPrincipal", "licenseConfig"] }
        },
        deleteUnassignedUserLicenses: true
    };
    return gapiRequest<any>(url, 'POST', projectId, undefined, body);
};

export const registerA2aAgent = async (config: Config, agentId: string, payload: any) => {
    return createAgent(payload, config, agentId);
};

export const fetchA2aAgentCard = async (serviceUrl: string, accessToken: string) => {
    const url = `${serviceUrl.replace(/\/$/, '')}/.well-known/agent.json`;
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`A2A Discovery Error: ${response.status} - ${await response.text()}`);
    }
    return response.json();
};

export const invokeA2aAgent = async (serviceUrl: string, prompt: string, accessToken: string) => {
    const url = `${serviceUrl.replace(/\/$/, '')}/invoke`;
    const body = {
        jsonrpc: "2.0",
        method: "chat",
        params: { message: { role: "user", parts: [{ text: prompt }] } },
        id: "1"
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`A2A Invocation Error: ${response.status} - ${await response.text()}`);
    }
    return response.json();
};
