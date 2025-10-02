// FIX: Replaced incorrect component code with proper type definitions.
export enum Page {
  AGENTS = 'Agents',
  AUTHORIZATIONS = 'Authorizations',
  AGENT_ENGINES = 'Agent Engines',
  BACKUP_RECOVERY = 'Backup & Recovery',
}

export type SortableAgentKey = 'displayName' | 'state' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: SortableAgentKey;
  direction: SortDirection;
}

export interface Config {
  accessToken: string;
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
  authorizationType: 'OAUTH_CLIENT_ID';
  oauthClientId: string;
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