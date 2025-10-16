// FIX: Replaced incorrect component code with proper type definitions.
export enum Page {
  AGENTS = 'Agents',
  AUTHORIZATIONS = 'Authorizations',
  AGENT_ENGINES = 'Agent Engines',
  AGENT_BUILDER = 'Agent Builder',
  CHAT = 'Chat',
  DATA_STORES = 'Data Stores',
  MCP_SERVERS = 'MCP Servers',
  MODEL_ARMOR = 'Model Armor',
  BACKUP_RECOVERY = 'Backup & Recovery',
}

export type SortableAgentKey = 'displayName' | 'state' | 'name' | 'updateTime';
export type SortDirection = 'asc' | 'desc';

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
}

export interface StarterPrompt {
  text: string;
}

export interface AuthorizationConfig {
  oauth2ClientId: string;
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
  managedAgentDefinition?: any;
  authorizations?: string[]; // Deprecated
  authorizationConfig?: AuthorizationConfig;
  entitlements?: any[];
  state?: 'ENABLED' | 'DISABLED';
  createTime?: string;
  updateTime?: string;
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
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answerDetails?: {
      diagnostics?: any;
      citations?: any[];
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
}
export interface Assistant {
    name: string;
    displayName: string;
    agents?: Agent[]; // For backup structure
    styleAndFormattingInstructions?: string;
    generationConfig?: {
        systemInstruction?: {
            additionalSystemInstruction?: string;
        };
    };
    webGroundingType?: string;
    customerPolicy?: object;
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