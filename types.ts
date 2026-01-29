
// FIX: Replaced incorrect component code with proper type definitions.
export enum Page {
  AGENTS = 'Agents Manager',
  ASSISTANT = 'Assistant',
  AUTHORIZATIONS = 'Authorizations',
  AGENT_ENGINES = 'Available Agents',
  A2A_TESTER = 'A2A Tester',
  AGENT_BUILDER = 'Agent Builder',
  AGENT_CATALOG = 'Agent Catalog',
  CLOUD_RUN_AGENTS = 'Cloud Run Agents',
  DIALOGFLOW_AGENTS = 'Dialogflow Agents',
  CHAT = 'Test G.E. Agent',
  DATA_STORES = 'Data Stores',
  MCP_SERVERS = 'MCP Servers',
  MODEL_ARMOR = 'Model Armor',
  BACKUP_RECOVERY = 'Backup & Recovery',
  ARCHITECTURE = 'Architecture',
  LICENSE = 'Licenses',
  CONNECTORS = 'Connectors',
}

export type SortableAgentKey = 'displayName' | 'state' | 'name' | 'updateTime' | 'agentType';
export type SortDirection = 'asc' | 'desc';

export interface UserProfile {
    name: string;
    email: string;
    picture: string;
}

export interface SortConfig {
  key: SortableAgentKey;
  direction: SortDirection;
}

export interface Config {
  projectId: string;
  appLocation: string;
  collectionId: string;
  appId: string;
  assistantId: string;
  dataStoreId?: string;
  reasoningEngineLocation?: string;
  reasoningEngineId?: string;
  suppressErrorLog?: boolean;
}

export interface StarterPrompt {
  text: string;
}

export interface AuthorizationConfig {
  oauth2ClientId?: string; // Made optional as it might be replaced by toolAuthorizations
  toolAuthorizations?: string[];
}

export interface Agent {
  name: string;
  displayName: string;
  description?: string;
  icon?: {
    uri: string;
  };
  starterPrompts?: StarterPrompt[];
  adkAgentDefinition?: {
    toolSettings?: {
      toolDescription: string;
    };
    provisionedReasoningEngine?: {
      reasoningEngine: string;
    };
  };
  a2aAgentDefinition?: {
    jsonAgentCard: string;
  };
  managedAgentDefinition?: any;
  authorizations?: string[]; // Deprecated
  authorizationConfig?: AuthorizationConfig;
  entitlements?: any[];
  state?: 'ENABLED' | 'DISABLED';
  createTime?: string;
  updateTime?: string;
  agentType?: string;
  agentOrigin?: string;
}

export interface Oauth2Config {
    clientId: string;
    clientSecret?: string; // Often write-only
    authorizationUri: string;
    tokenUri: string;
}

export interface Authorization {
  name: string;
  serverSideOauth2: Oauth2Config;
}

export interface ReasoningEngine {
  name: string;
  displayName: string;
  sessionCount?: number;
  spec?: {
    packageSpec?: {
      pickleObjectGcsUri?: string;
      dependencyFilesGcsUri?: string;
      requirementsGcsUri?: string;
      pythonVersion?: string;
    };
    deploymentSpec?: {
      env?: EnvVar[];
    };
    agentFramework?: string;
  };
  createTime?: string;
  updateTime?: string;
}

export interface DialogflowAgent {
  name: string;
  displayName: string;
  description?: string;
  avatarUri?: string;
  timeZone?: string;
  defaultLanguageCode?: string;
  createTime?: string;
  updateTime?: string;
  startFlow?: string;
  startPlaybook?: string;
  genAppBuilderSettings?: {
      engine?: string;
  };
  speechToTextSettings?: {
      enableSpeechAdaptation?: boolean;
  };
  advancedSettings?: {
      loggingSettings?: any;
      speechSettings?: any;
      audioExportGcsDestination?: any;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answerDetails?: {
      diagnostics?: any;
      citations?: any[];
      groundingMetadata?: any;
  }
}

// Types for Discovery Resources
export interface Collection {
    name: string;
    displayName: string;
    engines?: AppEngine[]; // For backup structure
}
export interface AppEngine { // Renamed from Engine to avoid conflict with ReasoningEngine
    name: string;
    displayName: string;
    solutionType: string;
    assistants?: Assistant[]; // For backup structure
    dataStoreIds?: string[];
    // Add missing properties based on API response
    industryVertical?: string;
    appType?: string; // e.g. APP_TYPE_INTRANET
    searchEngineConfig?: any;
  features?: Record<string, string>; // Map of feature name to 'FEATURE_STATE_ON'|'FEATURE_STATE_OFF'
  modelConfigs?: Record<string, string>; // Map of model name to 'MODEL_ENABLED'|'MODEL_DISABLED'
}

export interface VertexAiAgentConfig {
    displayName: string;
    name: string;
    toolDescription: string;
}

export interface EnabledAction {
    actionInfo: {
        actionName: string;
        actionDisplayName: string;
    }[];
}

export interface EnabledTool {
    toolInfo: {
        toolName: string;
        toolDisplayName: string;
    }[];
}

export interface Assistant {
    name: string;
    displayName: string;
    description?: string;
    agents?: Agent[]; // For backup structure
    styleAndFormattingInstructions?: string;
    generationConfig?: {
        systemInstruction?: {
            additionalSystemInstruction?: string;
        };
    };
    googleSearchGroundingEnabled?: boolean;
    webGroundingType?: string;
    defaultWebGroundingToggleOff?: boolean;
    customerPolicy?: object;
    vertexAiAgentConfigs?: VertexAiAgentConfig[];
    enabledActions?: Record<string, EnabledAction>;
    enabledTools?: Record<string, EnabledTool>;
    vertexAiSearchToolConfig?: object;
    agentConfigs?: object[];
    enableEndUserAgentCreation?: boolean;
    disableLocationContext?: boolean;
}


export interface DataStore {
    name: string;
    displayName: string;
    industryVertical: string;
    solutionTypes: string[];
    contentConfig: string;
}

export interface Document {
    name: string;
    id: string;
    displayName?: string;
    content?: {
        uri: string;
    };
    jsonData?: string;
    structData?: Record<string, any>;

}

export interface LogEntry {
  logName: string;
  receiveTimestamp: string;
  severity: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'DEFAULT';
  protoPayload?: any;
  jsonPayload?: any;
  textPayload?: string;
  resource: {
    type: string;
    labels: { [key: string]: string };
  };
  labels?: { [key: string]: string };
}

// GCS Types
export interface GcsBucket {
    id: string;
    name: string;
    }

export interface GcsObject {
    name: string;
    bucket: string;
}

// Cloud Run Types
export interface EnvVar {
    name: string;
    value?: string;
    valueSource?: {
        secretKeyRef: {
            secret: string;
            version: string;
        }
    };
}

export interface Container {
    image: string;
    env: EnvVar[];
    resources?: {
        limits?: { [key: string]: string };
    };
}

export interface ServiceTemplate {
    containers: Container[];
    serviceAccount?: string;
    scaling?: any;
}

export interface CloudRunService {
    name: string;
    uri: string;
    location: string;
    labels?: Record<string, string>;
    createTime: string;
    updateTime: string;
    template?: ServiceTemplate;
}

// Architecture Graph Types
export type NodeType = 'Project' | 'Location' | 'Collection' | 'Engine' | 'Assistant' | 'Agent' | 'ReasoningEngine' | 'DataStore' | 'Authorization' | 'CloudRunService';

export interface GraphNode {
  id: string; // full resource name
  type: NodeType;
  label: string; // short display name
  data: any; // full resource object
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}
