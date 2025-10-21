import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Agent, AppEngine, Assistant, Authorization, Collection, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import RestoreSelectionModal from '../components/backup/RestoreSelectionModal';
import ClientSecretPrompt from '../components/backup/ClientSecretPrompt';

interface BackupPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Sub-Components ---

// FIX: Changed component definition to use a typed interface and React.FC to resolve a props typing issue where the 'key' prop was incorrectly being considered part of the component's props.
interface BackupRestoreCardProps {
  section: string;
  title: string;
  onBackup: () => Promise<void>;
  onRestore: (section: string, processor: (data: any) => Promise<void>) => Promise<void>;
  processor: (data: any) => Promise<void>;
  restoreFile: File | null;
  onFileChange: (section: string, file: File | null) => void;
  restoreFileInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>;
  loadingSection: string | null;
  isGloballyLoading: boolean;
}

const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({ 
  section, 
  title, 
  onBackup, 
  onRestore, 
  processor, 
  restoreFile, 
  onFileChange,
  restoreFileInputRefs,
  loadingSection,
  isGloballyLoading
}) => {
    const isBackupLoading = loadingSection === `Backup${section}`;
    const isRestoreLoading = loadingSection === `Restore${section}`;
    const isThisCardLoading = isBackupLoading || isRestoreLoading;

    return (
      <div className={`bg-gray-900 rounded-lg p-4 shadow-lg flex flex-col border transition-colors ${isThisCardLoading ? 'border-blue-500' : 'border-gray-700'}`}>
        <h3 className="text-lg font-semibold text-white text-center mb-4">{title}</h3>
        
        {/* Backup Action */}
        <div className="flex-1 mb-4">
          <button 
            onClick={onBackup} 
            disabled={isGloballyLoading} 
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-10"
          >
            {isBackupLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Backing up...
              </>
            ) : 'Backup'}
          </button>
        </div>

        {/* Separator */}
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-gray-700"></div>
          <span className="flex-shrink mx-4 text-gray-500 text-xs uppercase">Or</span>
          <div className="flex-grow border-t border-gray-700"></div>
        </div>

        {/* Restore Action */}
        <div className="flex-1 mt-4">
          <p className="text-xs text-center text-gray-400 mb-2">Restore from a .json backup file.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="file"
              accept=".json"
              // FIX: Corrected the ref callback to return void by using a block statement, resolving a TypeScript type error.
              ref={el => { restoreFileInputRefs.current[section] = el; }}
              onChange={(e) => onFileChange(section, e.target.files ? e.target.files[0] : null)}
              disabled={isGloballyLoading}
              className="block w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => onRestore(section, processor)}
              disabled={isGloballyLoading || !restoreFile}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed w-full sm:w-auto flex items-center justify-center h-8"
            >
              {isRestoreLoading ? (
                <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    <span>Restoring...</span>
                </>
              ) : 'Restore'}
            </button>
          </div>
        </div>
      </div>
    );
};


// --- Main Page Component ---

const BackupPage: React.FC<BackupPageProps> = ({ accessToken, projectNumber, setProjectNumber }) => {
  const [config, setConfig] = useState({
    appLocation: 'global',
    appId: '',
    reasoningEngineLocation: 'us-central1',
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [restoreFile, setRestoreFile] = useState<{ [key: string]: File | null }>({});
  const restoreFileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [modalData, setModalData] = useState<{
    section: string;
    title: string;
    items: any[];
    processor: (data: any) => Promise<void>;
    originalData: any;
  } | null>(null);
  
  const [secretPrompt, setSecretPrompt] = useState<{ auth: Authorization; resolve: (secret: string | null) => void; customMessage?: string; } | null>(null);

  // State for dropdown options
  const [apps, setApps] = useState<AppEngine[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);


  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleProjectNumberChange = (newValue: string) => {
    setProjectNumber(newValue);
    // Reset dependent fields when project changes
    setConfig(prev => ({
        ...prev,
        appId: '',
    }));
    setApps([]);
  };
  
  const handleFileChange = (section: string, file: File | null) => {
      setRestoreFile(prev => ({ ...prev, [section]: file }));
  };

  const addLog = (message: string) => {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // --- Effects to fetch dropdown data ---
  useEffect(() => {
    if (!apiConfig.projectId || !apiConfig.appLocation) {
        setApps([]);
        return;
    }
    const fetchApps = async () => {
        setIsLoadingApps(true);
        setApps([]);
        try {
            const response = await api.listResources('engines', apiConfig);
            const fetchedApps = response.engines || [];
            setApps(fetchedApps);
            if (fetchedApps.length === 1) {
                const singleAppId = fetchedApps[0].name.split('/').pop();
                if (singleAppId) {
                    setConfig(prev => ({ ...prev, appId: singleAppId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch apps:", err);
        } finally {
            setIsLoadingApps(false);
        }
    };
    fetchApps();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.collectionId]);


  const downloadJson = (data: object, filenamePrefix: string) => {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `${filenamePrefix}-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };
  
  const executeOperation = async (section: string, operation: () => Promise<void>) => {
      setIsLoading(true);
      setLoadingSection(section);
      setError(null);
      setLogs([]);
      try {
          await operation();
      } catch (err: any) {
          setError(err.message || `An unknown error occurred in ${section}.`);
          addLog(`FATAL ERROR: ${err.message}`);
      } finally {
          setIsLoading(false);
          setLoadingSection(null);
      }
  };

  const pollOperation = async (operation: any, pollConfig: typeof apiConfig, resourceName: string) => {
    let currentOperation = operation;
    addLog(`  - Operation for ${resourceName} initiated (${currentOperation.name}). Polling for completion...`);
    while (!currentOperation.done) {
        await delay(5000); // Poll every 5 seconds
        currentOperation = await api.getDiscoveryOperation(currentOperation.name, pollConfig);
        addLog(`    - Polling ${resourceName}... status: ${currentOperation.done ? 'DONE' : 'IN_PROGRESS'}`);
    }

    if (currentOperation.error) {
        const errorMessage = currentOperation.error.message || JSON.stringify(currentOperation.error);
        throw new Error(`${resourceName} creation failed: ${errorMessage}`);
    }
    addLog(`  - ${resourceName} ready.`);
    return currentOperation.response;
  };

  // --- Backup Handlers ---
  const handleBackupDiscovery = async () => executeOperation('BackupDiscoveryResources', async () => {
    addLog('Starting Discovery Resources backup for default_collection...');
    const collectionsResponse = await api.listResources('collections', apiConfig);
    const collections: Collection[] = (collectionsResponse.collections || []).filter(c => c.name.endsWith('/default_collection'));

    if (collections.length === 0) {
        addLog('Warning: default_collection not found in this location.');
        const backupData = { type: 'DiscoveryResources', createdAt: new Date().toISOString(), sourceConfig: apiConfig, collections: [] };
        downloadJson(backupData, 'agentspace-discovery-backup');
        addLog(`Backup complete! No collections found to back up.`);
        return;
    }
    
    for (const collection of collections) {
        const collectionId = collection.name.split('/').pop()!;
        const enginesResponse = await api.listResources('engines', { ...apiConfig, collectionId });
        const engines: AppEngine[] = enginesResponse.engines || [];
        collection.engines = engines;

        for (const engine of engines) {
            const appId = engine.name.split('/').pop()!;
            const assistantsResponse = await api.listResources('assistants', { ...apiConfig, collectionId, appId });
            engine.assistants = (assistantsResponse.assistants || []).filter(a => a.name.endsWith('/default_assistant'));
        }
    }

    const backupData = { type: 'DiscoveryResources', createdAt: new Date().toISOString(), sourceConfig: apiConfig, collections };
    downloadJson(backupData, 'agentspace-discovery-backup');
    addLog(`Backup complete! Found and backed up 'default_collection'.`);
  });
  
  const handleBackupAppEngine = async () => executeOperation('BackupAppEngine', async () => {
    if (!apiConfig.appId) {
      throw new Error("Gemini Enterprise ID must be set in the configuration to back up a single engine.");
    }
    addLog(`Starting backup for App/Engine: ${apiConfig.appId}...`);
    const engineName = `projects/${apiConfig.projectId}/locations/${apiConfig.appLocation}/collections/${apiConfig.collectionId}/engines/${apiConfig.appId}`;
    
    const engine = await api.getEngine(engineName, apiConfig);
    
    const assistantsResponse = await api.listResources('assistants', { ...apiConfig, appId: apiConfig.appId });
    engine.assistants = (assistantsResponse.assistants || []).filter(a => a.name.endsWith('/default_assistant'));

    const backupData = { type: 'AppEngine', createdAt: new Date().toISOString(), sourceConfig: apiConfig, engine };
    downloadJson(backupData, `agentspace-app-engine-${apiConfig.appId}-backup`);
    addLog(`Backup complete! App/Engine '${engine.displayName}' and its default_assistant saved.`);
  });

  const handleBackupAssistant = async () => executeOperation('BackupAssistant', async () => {
    if (!apiConfig.appId) {
      throw new Error("Gemini Enterprise ID must be set to back up an assistant.");
    }
    addLog(`Starting backup for Assistant: ${apiConfig.assistantId}...`);
    const assistantName = `projects/${apiConfig.projectId}/locations/${apiConfig.appLocation}/collections/${apiConfig.collectionId}/engines/${apiConfig.appId}/assistants/${apiConfig.assistantId}`;
    
    const assistant = await api.getAssistant(assistantName, apiConfig);

    const agentsResponse = await api.listResources('agents', apiConfig);
    assistant.agents = agentsResponse.agents || [];
    
    const backupData = { type: 'Assistant', createdAt: new Date().toISOString(), sourceConfig: apiConfig, assistant };
    downloadJson(backupData, `agentspace-assistant-${apiConfig.assistantId}-backup`);
    addLog(`Backup complete! Assistant '${assistant.displayName}' and its ${assistant.agents.length} agents saved.`);
  });
  
  const handleBackupAgents = async () => executeOperation('BackupAgents', async () => {
    if (!apiConfig.appId) {
      throw new Error("Gemini Enterprise ID must be set to back up agents.");
    }
    addLog(`Starting backup for agents in Assistant: ${apiConfig.assistantId}...`);
    
    const agentsResponse = await api.listResources('agents', apiConfig);
    const agents: Agent[] = agentsResponse.agents || [];
    
    const backupData = { type: 'Agents', createdAt: new Date().toISOString(), sourceConfig: apiConfig, agents };
    downloadJson(backupData, `agentspace-agents-${apiConfig.assistantId}-backup`);
    addLog(`Backup complete! Found ${agents.length} agents.`);
  });

  const handleBackupDataStores = async () => executeOperation('BackupDataStores', async () => {
    addLog('Starting Data Stores backup for default_collection...');
    const dataStoresResponse = await api.listResources('dataStores', apiConfig);
    const dataStores: DataStore[] = dataStoresResponse.dataStores || [];
    
    const backupData = { type: 'DataStores', createdAt: new Date().toISOString(), sourceConfig: apiConfig, dataStores };
    downloadJson(backupData, 'agentspace-data-stores-backup');
    addLog(`Backup complete! Found ${dataStores.length} data stores.`);
  });

  const handleBackupAuthorizations = async () => executeOperation('BackupAuthorizations', async () => {
      addLog("Starting Authorizations backup...");
      const response = await api.listAuthorizations(apiConfig);
      const authorizations: Authorization[] = (response.authorizations || []).map(auth => {
          // Explicitly remove client secret for security
          if (auth.serverSideOauth2.clientSecret) {
              delete auth.serverSideOauth2.clientSecret;
          }
          return auth;
      });
      
      const backupData = { type: 'Authorizations', createdAt: new Date().toISOString(), sourceConfig: apiConfig, authorizations };
      downloadJson(backupData, 'agentspace-authorizations-backup');
      addLog(`Backup complete! Found ${authorizations.length} authorizations (client secrets omitted).`);
  });


  // --- Restore Handlers & Processors ---

  const handleRestore = async (section: string, processor: (data: any) => Promise<void>) => {
    const file = restoreFile[section];
    if (!file) {
      setError(`Please select a backup file for ${section}.`);
      return;
    }
    
    const sectionName = section.replace(/[A-Z]/g, ' $&').trim(); // e.g., 'DiscoveryResources' -> 'Discovery Resources'
    executeOperation(`Restore${section}`, async () => {
      addLog(`Reading file: ${file.name}...`);
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);
      
      if (backupData.type !== section) {
        throw new Error(`Invalid backup file type. Expected '${section}', but found '${backupData.type}'.`);
      }
      
      await processor(backupData);
      addLog(`Restore process for ${sectionName} finished.`);
    });
  };

  const handleConfirmRestore = (section: string, items: any[], processor: (data: any) => Promise<void>, originalData: any) => {
    setModalData(null); // Close the modal first

    const sectionName = section.replace(/[A-Z]/g, ' $&').trim();
    executeOperation(`Restore${section}`, async () => {
      let dataToRestore = { ...originalData };
      
      // Filter the original data based on the selected items
      switch (section) {
          case 'DiscoveryResources':
              dataToRestore.collections = originalData.collections.filter((c: Collection) => items.some(item => item.name === c.name));
              break;
          case 'AppEngine':
              dataToRestore.engine.assistants = originalData.engine.assistants.filter((a: Assistant) => items.some(item => item.name === a.name));
              break;
          case 'Assistant':
              dataToRestore.assistant.agents = originalData.assistant.agents.filter((a: Agent) => items.some(item => item.name === a.name));
              break;
          case 'Agents':
              dataToRestore.agents = originalData.agents.filter((a: Agent) => items.some(item => item.name === a.name));
              break;
          case 'DataStores':
              dataToRestore.dataStores = originalData.dataStores.filter((ds: DataStore) => items.some(item => item.name === ds.name));
              break;
          case 'Authorizations':
              dataToRestore.authorizations = originalData.authorizations.filter((auth: Authorization) => items.some(item => item.name === auth.name));
              break;
          default:
              throw new Error(`Unknown section type for selective restore: ${section}`);
      }
      
      addLog(`Starting restore of ${items.length} selected ${sectionName}...`);
      await processor(dataToRestore);
      addLog(`Restore process for ${sectionName} finished.`);
    });
  };

  const restoreAgentsIntoAssistant = async (agents: Agent[], restoreConfig: typeof apiConfig) => {
    addLog(`  - Restoring ${agents.length} agent(s)...`);
    for (const agent of agents) {
      const originalAgentId = agent.name.split('/').pop()!;
      addLog(`    - Preparing to restore agent: ${agent.displayName} (from original ID: ${originalAgentId}) as a new agent.`);
  
      // Build a clean payload from scratch
      const buildPayload = (currentAgent: Agent): any => {
        const finalStarterPrompts = (currentAgent.starterPrompts || [])
          .map(p => p.text ? p.text.trim() : '')
          .filter(text => text)
          .map(text => ({ text }));

        const payload: any = {
          displayName: currentAgent.displayName,
          description: currentAgent.description || '',
          icon: currentAgent.icon || undefined,
          starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
          authorizations: currentAgent.authorizations || undefined,
        };

        // FIX: Replaced non-existent 'a2aAgentDefinition' with 'managedAgentDefinition' to correctly handle private/managed agents.
        if (currentAgent.managedAgentDefinition) {
          payload.managedAgentDefinition = currentAgent.managedAgentDefinition;
        } else if (currentAgent.adkAgentDefinition) {
          const adkDef = currentAgent.adkAgentDefinition;
          payload.adk_agent_definition = {
            tool_settings: { tool_description: adkDef.toolSettings?.toolDescription },
            provisioned_reasoning_engine: { reasoning_engine: adkDef.provisionedReasoningEngine?.reasoningEngine }
          };
        }
        return payload;
      };

      let createPayload = buildPayload(agent);
  
      try {
        // Create the agent without specifying an ID to get a new one.
        const newAgent = await api.createAgent(createPayload, restoreConfig);
        const newAgentId = newAgent.name.split('/').pop()!;
        addLog(`      - CREATED: Agent '${agent.displayName}' created successfully with new ID '${newAgentId}'.`);
      } catch (err: any) {
        if (err.message && err.message.includes("is used by another agent")) {
          addLog(`      - WARNING: Authorization is in use. Attempting to create a new one.`);
          const originalAuthName = agent.authorizations?.[0];
          if (!originalAuthName) {
            addLog(`      - ERROR: Cannot resolve authorization conflict. Agent in backup has no authorization specified. Skipping agent.`);
            continue;
          }

          try {
            addLog(`        - Fetching details for original authorization: ${originalAuthName.split('/').pop()}`);
            const originalAuthDetails = await api.getAuthorization(originalAuthName, restoreConfig);
            
            const originalAuthId = originalAuthName.split('/').pop()!;
            const newAuthId = `${originalAuthId}-${Date.now()}`;
            addLog(`        - Proposing new authorization ID: ${newAuthId}`);
            
            const tempAuthForPrompt: Authorization = { name: `projects/${restoreConfig.projectId}/locations/global/authorizations/${newAuthId}`, serverSideOauth2: originalAuthDetails.serverSideOauth2 };
            const clientSecret = await promptForSecret(tempAuthForPrompt, `The original authorization ('${originalAuthId}') is in use. A new one named "${newAuthId}" will be created. Please provide the client secret to proceed.`);
            
            if (!clientSecret) {
                addLog(`        - SKIPPED: User did not provide a secret for the new authorization. Cannot restore agent.`);
                continue;
            }

            addLog(`        - Creating new authorization: ${newAuthId}`);
            const newAuthPayload = { serverSideOauth2: { ...originalAuthDetails.serverSideOauth2, clientSecret } };
            const newAuthorization = await api.createAuthorization(newAuthId, newAuthPayload, restoreConfig);
            addLog(`        - CREATED: New authorization created: ${newAuthorization.name}`);
            
            addLog(`        - Retrying agent creation with new authorization...`);
            createPayload.authorizations = [newAuthorization.name];
            const newAgent = await api.createAgent(createPayload, restoreConfig);
            const newAgentId = newAgent.name.split('/').pop()!;
            addLog(`      - CREATED: Agent '${agent.displayName}' created successfully with new ID '${newAgentId}' and new authorization.`);

          } catch (recoveryErr: any) {
            addLog(`      - ERROR: Failed during authorization recovery process: ${recoveryErr.message}. Skipping agent.`);
          }
        } else {
            addLog(`      - ERROR: Failed to create new agent for '${agent.displayName}': ${err.message}`);
        }
      }
      await delay(1000); // Rate limit
    }
  };

  const processRestoreDiscovery = async (backupData: any) => {
    if (!backupData.collections || backupData.collections.length === 0) {
      addLog("No collections found in backup file to restore.");
      return;
    }

    setModalData({
      section: 'DiscoveryResources',
      title: 'Select Collections to Restore',
      items: backupData.collections,
      originalData: backupData,
      processor: async (data) => {
        addLog(`Restoring ${data.collections.length} Collection(s)...`);
        for (const collection of data.collections) {
            const collectionId = collection.name.split('/').pop()!;
            addLog(`Restoring Collection '${collection.displayName}' (${collectionId})...`);
            
            const restoreConfig = { ...apiConfig, collectionId };
            
            try {
                await api.createCollection(collectionId, { displayName: collection.displayName }, restoreConfig);
                addLog(`  - CREATED: Collection '${collectionId}'`);
            } catch (err: any) {
                if (err.message && err.message.includes("ALREADY_EXISTS")) {
                    addLog(`  - INFO: Collection '${collectionId}' already exists. Proceeding...`);
                } else {
                    addLog(`  - ERROR: Failed to create collection '${collectionId}': ${err.message}`);
                    continue; // Skip to next collection on failure
                }
            }
            await delay(2000); // Wait for collection to be ready

            if (collection.engines && collection.engines.length > 0) {
              addLog(`  - Restoring ${collection.engines.length} App/Engine(s) into collection '${collectionId}'...`);

              for (const engine of collection.engines) {
                  const engineId = engine.name.split('/').pop()!;
                  addLog(`    - Restoring App/Engine '${engine.displayName}' (${engineId})`);
                  const engineRestoreConfig = { ...restoreConfig, appId: engineId };
                  
                  try {
                      const dsId = `ds-for-${engineId}-${Date.now()}`;
                      const dsPayload = { 
                          displayName: `Data Store for ${engine.displayName}`,
                          industryVertical: 'GENERIC',
                          solutionTypes: ["SOLUTION_TYPE_SEARCH"],
                          contentConfig: "NO_CONTENT"
                      };
                      const dsOperation = await api.createDataStore(dsId, dsPayload, engineRestoreConfig);
                      await pollOperation(dsOperation, engineRestoreConfig, `Data Store '${dsId}'`);

                      const enginePayload: any = {
                          displayName: engine.displayName,
                          solutionType: "SOLUTION_TYPE_SEARCH",
                          dataStoreIds: [dsId],
                          appType: 'APP_TYPE_INTRANET',
                          commonConfig: {
                              companyName: ""
                          },
                          searchEngineConfig: {
                              searchTier: "SEARCH_TIER_ENTERPRISE",
                              searchAddOns: ["SEARCH_ADD_ON_LLM"],
                              requiredSubscriptionTier: "SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT"
                          }
                      };
                      
                      const engineOperation = await api.createEngine(engineId, enginePayload, engineRestoreConfig);
                      await pollOperation(engineOperation, engineRestoreConfig, `App/Engine '${engineId}'`);
                      addLog(`      - CREATED: App/Engine '${engineId}'`);

                  } catch (err: any) {
                      if (err.message && err.message.includes("ALREADY_EXISTS")) {
                          addLog(`      - INFO: App/Engine '${engineId}' already exists. Proceeding...`);
                      } else {
                          addLog(`      - ERROR: Failed to create App/Engine '${engineId}': ${err.message}`);
                          continue; // Skip to next engine
                      }
                  }

                  if (engine.assistants && engine.assistants.length > 0) {
                      // ... nested restore logic for assistants ...
                  }
              }
            }
        }
      }
    });
  };

  const processRestoreAppEngine = async (backupData: any) => {
    const { engine } = backupData;
    if (!engine) {
      addLog("No App/Engine data found in backup file.");
      return;
    }
     setModalData({
      section: 'AppEngine',
      title: 'Select Assistants to Restore',
      items: engine.assistants || [],
      originalData: backupData,
      processor: async (data) => {
        const engineToRestore = data.engine;
        const engineId = engineToRestore.name.split('/').pop()!;
        const collectionId = apiConfig.collectionId;
        addLog(`Restoring App/Engine '${engineToRestore.displayName}' (${engineId}) into collection '${collectionId}'...`);
        const restoreConfig = { ...apiConfig, collectionId, appId: engineId };
        
        try {
            const dsId = `ds-for-${engineId}-${Date.now()}`;
            const dsPayload = { 
                displayName: `Data Store for ${engineToRestore.displayName}`,
                industryVertical: 'GENERIC',
                solutionTypes: ["SOLUTION_TYPE_SEARCH"],
                contentConfig: "NO_CONTENT"
            };
            const dsOperation = await api.createDataStore(dsId, dsPayload, restoreConfig);
            await pollOperation(dsOperation, restoreConfig, `Data Store '${dsId}'`);

            const enginePayload: any = {
                displayName: engineToRestore.displayName,
                solutionType: "SOLUTION_TYPE_SEARCH",
                dataStoreIds: [dsId],
                appType: 'APP_TYPE_INTRANET',
                commonConfig: {
                    companyName: ""
                },
                searchEngineConfig: {
                    searchTier: "SEARCH_TIER_ENTERPRISE",
                    searchAddOns: ["SEARCH_ADD_ON_LLM"],
                    requiredSubscriptionTier: "SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT"
                }
            };
            const engineOperation = await api.createEngine(engineId, enginePayload, restoreConfig);
            await pollOperation(engineOperation, restoreConfig, `App/Engine '${engineId}'`);
            addLog(`  - CREATED: App/Engine '${engineId}'`);
            
        } catch (err: any) {
             if (err.message && err.message.includes("ALREADY_EXISTS")) {
                addLog(`  - INFO: App/Engine '${engineId}' already exists. Proceeding to restore assistants into it.`);
            } else {
                addLog(`  - ERROR: Failed to create App/Engine '${engineId}': ${err.message}`);
                throw err; // Stop if engine creation fails
            }
        }

        if (engineToRestore.assistants && engineToRestore.assistants.length > 0) {
          addLog(`  - Restoring ${engineToRestore.assistants.length} assistant(s)...`);
          for (const assistant of engineToRestore.assistants) {
              await processRestoreAssistant({ assistant }, false); // Call sub-processor directly
          }
        }
      }
    });
  };

  const processRestoreAssistant = async (backupData: any, useModal = true) => {
      const { assistant } = backupData;
      if (!assistant) {
          addLog("No Assistant data found in the backup.");
          return;
      }

      // This is the new logic for the "Restore Single Assistant" button.
      // It uses the assistant selected in the UI dropdown as the target.
      if (useModal) {
          if (!assistant.agents || assistant.agents.length === 0) {
            addLog("No agents found in the assistant backup file to restore.");
            return;
          }
          
          // The processor function that will be called after the user selects agents in the modal.
          const processor = async (data: any) => {
              const agentsToRestore = data.assistant.agents; 
              const restoreConfig = apiConfig; // Uses the UI config, including the target assistantId

              if (!restoreConfig.appId) {
                  throw new Error("You must select a target Gemini Enterprise in the configuration before restoring agents from an assistant backup.");
              }
              
              addLog(`Restoring ${agentsToRestore.length} agent(s) into selected assistant '${restoreConfig.assistantId}'...`);
              await restoreAgentsIntoAssistant(agentsToRestore, restoreConfig);
          };

          // Open the modal to let the user select which agents to restore.
          setModalData({
              section: 'Assistant',
              title: 'Select Agents to Restore',
              items: assistant.agents || [],
              originalData: backupData,
              processor: processor,
          });

      // This is the old logic, preserved for cascading restores (e.g., from an AppEngine backup).
      // It creates/updates the assistant from the backup file before restoring agents into it.
      } else {
          const assistantToRestore = backupData.assistant;
          const assistantId = assistantToRestore.name.split('/').pop()!;
          // IMPORTANT: Here it uses the assistantId from the backup file.
          const restoreConfig = { ...apiConfig, assistantId }; 

          addLog(`Restoring Assistant '${assistantToRestore.displayName}' (${assistantId}) into app '${restoreConfig.appId}'...`);
          try {
              await api.createAssistant(assistantId, { displayName: assistantToRestore.displayName }, restoreConfig);
              addLog(`  - CREATED: Assistant '${assistantId}'`);
          } catch (err: any) {
              if (err.message && err.message.includes("ALREADY_EXISTS")) {
                  addLog(`  - INFO: Assistant '${assistantId}' already exists. Attempting to update it.`);
                  try {
                      const assistantName = `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation}/collections/${restoreConfig.collectionId}/engines/${restoreConfig.appId}/assistants/${assistantId}`;
                      const payload: any = {};
                      const updateMask: string[] = [];

                      if (assistantToRestore.displayName) {
                        payload.displayName = assistantToRestore.displayName;
                        updateMask.push('display_name');
                      }
                      if (assistantToRestore.styleAndFormattingInstructions) {
                          payload.styleAndFormattingInstructions = assistantToRestore.styleAndFormattingInstructions;
                          updateMask.push('style_and_formatting_instructions');
                      }
                      if (assistantToRestore.generationConfig) {
                          payload.generationConfig = assistantToRestore.generationConfig;
                          updateMask.push('generation_config');
                      }
                      
                      if (updateMask.length > 0) {
                        await api.updateAssistant(assistantName, payload, updateMask, restoreConfig);
                        addLog(`  - UPDATED: Assistant '${assistantId}' updated with settings from backup.`);
                      } else {
                        addLog(`  - INFO: No updatable fields found in backup for assistant '${assistantId}'. Skipping update.`);
                      }
                  } catch (updateErr: any) {
                      addLog(`  - ERROR: Failed to update existing assistant '${assistantId}': ${updateErr.message}. Proceeding to restore agents anyway.`);
                  }
              } else {
                  addLog(`  - ERROR: Failed to create assistant '${assistantId}': ${err.message}`);
                  throw err; // Stop if it's not an ALREADY_EXISTS error
              }
          }
          await delay(2000);
          
          if (assistantToRestore.agents && assistantToRestore.agents.length > 0) {
              await restoreAgentsIntoAssistant(assistantToRestore.agents, restoreConfig);
          } else {
              addLog("  - No agents found in the backup for this assistant.");
          }
      }
  };
  
  const processRestoreAgents = async (backupData: any) => {
    const { agents } = backupData;
    if (!agents) {
        addLog("No agent data found in the backup.");
        return;
    }

    const restoreConfig = apiConfig;
    if (!restoreConfig.appId) {
        throw new Error("You must select a target Gemini Enterprise in the configuration before restoring agents.");
    }

    setModalData({
        section: 'Agents',
        title: 'Select Agents to Restore',
        items: agents,
        originalData: backupData,
        processor: async (data) => {
            await restoreAgentsIntoAssistant(data.agents, restoreConfig);
        },
    });
  };

  const processRestoreDataStores = async (backupData: any) => {
    setModalData({
      section: 'DataStores',
      title: 'Select Data Stores to Restore',
      items: backupData.dataStores || [],
      originalData: backupData,
      processor: async (data) => {
        addLog(`Restoring ${data.dataStores.length} Data Store(s) into collection '${apiConfig.collectionId}'...`);
        for (const dataStore of data.dataStores) {
          const dsId = dataStore.name.split('/').pop()!;
          addLog(`  - Restoring Data Store '${dataStore.displayName}' (${dsId})`);
          try {
            // Construct a clean payload with only writable fields
            const payload = {
                displayName: dataStore.displayName,
                industryVertical: dataStore.industryVertical,
                solutionTypes: dataStore.solutionTypes,
                contentConfig: dataStore.contentConfig || 'NO_CONTENT',
            };
            await api.createDataStore(dsId, payload, apiConfig);
            addLog(`    - CREATED: Data Store '${dsId}'`);
          } catch (err: any) {
            if (err.message && err.message.includes("ALREADY_EXISTS")) {
                addLog(`    - INFO: Data Store '${dsId}' already exists. Skipping.`);
            } else {
                addLog(`    - ERROR: Failed to create Data Store '${dsId}': ${err.message}`);
            }
          }
          await delay(1000); // Rate limit
        }
      }
    });
  };

  const promptForSecret = (auth: Authorization, customMessage?: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setSecretPrompt({ auth, resolve, customMessage });
    });
  };

  const processRestoreAuthorizations = async (backupData: any) => {
     setModalData({
      section: 'Authorizations',
      title: 'Select Authorizations to Restore',
      items: backupData.authorizations || [],
      originalData: backupData,
      processor: async (data) => {
        addLog(`Restoring ${data.authorizations.length} Authorizations...`);
        for (const auth of data.authorizations) {
          const authId = auth.name.split('/').pop()!;
          addLog(`  - Preparing to restore authorization: ${authId}`);

          const clientSecret = await promptForSecret(auth);
          
          if (!clientSecret) {
            addLog(`    - SKIPPED: No client secret provided for ${authId}.`);
            continue;
          }

          const payload = { ...auth };
          payload.serverSideOauth2.clientSecret = clientSecret;

          try {
            await api.createAuthorization(authId, payload, apiConfig);
            addLog(`    - CREATED: Authorization '${authId}'`);
          } catch (err: any) {
            if (err.message && err.message.includes("ALREADY_EXISTS")) {
                addLog(`    - INFO: Authorization '${authId}' already exists. Skipping.`);
            } else {
                addLog(`    - ERROR: Failed to create authorization '${authId}': ${err.message}`);
            }
          }
          await delay(1000);
        }
      }
    });
  };

  const handleSecretSubmit = (secret: string) => {
    secretPrompt?.resolve(secret);
    setSecretPrompt(null);
  };

  const handleSecretClose = () => {
    secretPrompt?.resolve(null);
    setSecretPrompt(null);
  };

  const cardConfigs = [
    { section: 'DiscoveryResources', title: 'All Discovery Resources', backupHandler: handleBackupDiscovery, restoreProcessor: processRestoreDiscovery },
    { section: 'AppEngine', title: 'Single App / Engine', backupHandler: handleBackupAppEngine, restoreProcessor: processRestoreAppEngine },
    { section: 'Assistant', title: 'Single Assistant', backupHandler: handleBackupAssistant, restoreProcessor: processRestoreAssistant },
    { section: 'Agents', title: 'Agents', backupHandler: handleBackupAgents, restoreProcessor: processRestoreAgents },
    { section: 'DataStores', title: 'Data Stores', backupHandler: handleBackupDataStores, restoreProcessor: processRestoreDataStores },
    { section: 'Authorizations', title: 'Authorizations', backupHandler: handleBackupAuthorizations, restoreProcessor: processRestoreAuthorizations },
  ];

  return (
    <div className="space-y-6">
      {modalData && (
        <RestoreSelectionModal
          isOpen={!!modalData}
          onClose={() => setModalData(null)}
          onConfirm={(selectedItems) => handleConfirmRestore(modalData.section, selectedItems, modalData.processor, modalData.originalData)}
          title={modalData.title}
          items={modalData.items}
          isLoading={isLoading}
        />
      )}
      {secretPrompt && (
        <ClientSecretPrompt
          isOpen={!!secretPrompt}
          authId={secretPrompt.auth.name.split('/').pop() || ''}
          onSubmit={handleSecretSubmit}
          onClose={handleSecretClose}
          customMessage={secretPrompt.customMessage}
        />
      )}

      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Configuration for Backup & Restore</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Target Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Target Location</label>
            <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Target Gemini Enterprise ID</label>
             <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select App --'}</option>
              {apps.map(a => {
                  const id = a.name.split('/').pop() || '';
                  return <option key={a.name} value={id}>{a.displayName || id}</option>
              })}
            </select>
          </div>
        </div>
      </div>
      
       <div className="space-y-4">
          <h2 className="text-xl font-bold text-white text-center">Backup & Restore Actions</h2>
          <p className="text-center text-gray-400 text-sm -mt-2">Select a resource type below to perform a backup or restore operation.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cardConfigs.map(card => (
                <BackupRestoreCard
                    key={card.section}
                    section={card.section}
                    title={card.title}
                    onBackup={card.backupHandler}
                    onRestore={handleRestore}
                    processor={card.restoreProcessor}
                    restoreFile={restoreFile[card.section] || null}
                    onFileChange={handleFileChange}
                    restoreFileInputRefs={restoreFileInputRefs}
                    loadingSection={loadingSection}
                    isGloballyLoading={isLoading}
                />
            ))}
        </div>

      {(isLoading || logs.length > 0) && (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md mt-6">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
            {isLoading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>}
            {isLoading ? `Running: ${loadingSection?.replace(/[A-Z]/g, ' $&').trim()}` : 'Logs'}
          </h2>
          {error && <div className="text-sm text-red-400 p-2 mb-2 bg-red-900/20 rounded-md">{error}</div>}
          <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-64 overflow-y-auto font-mono">
            {logs.join('\n')}
          </pre>
        </div>
      )}

    </div>
  );
};

export default BackupPage;