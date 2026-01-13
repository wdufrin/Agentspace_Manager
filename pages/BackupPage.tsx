
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Agent, AppEngine, Assistant, Authorization, Collection, Config, DataStore, ReasoningEngine, GcsBucket, GcsObject } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import RestoreSelectionModal from '../components/backup/RestoreSelectionModal';
import ClientSecretPrompt from '../components/backup/ClientSecretPrompt';
import CurlInfoModal from '../components/CurlInfoModal';

interface BackupPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Sub-Components ---
const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);


interface BackupRestoreCardProps {
  section: string;
  title: string;
  onBackup: () => Promise<void>;
  onRestore: (section: string, processor: (data: any) => Promise<void>) => Promise<void>;
  processor: (data: any) => Promise<void>;
  availableBackups: string[];
  selectedBackup: string;
  onBackupSelectionChange: (section: string, value: string) => void;
  loadingSection: string | null;
  isGloballyLoading: boolean;
  onShowInfo: (infoKey: string) => void;
}

const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({ 
  section, 
  title, 
  onBackup, 
  onRestore, 
  processor, 
  availableBackups,
  selectedBackup,
  onBackupSelectionChange,
  loadingSection,
  isGloballyLoading,
  onShowInfo
}) => {
    const isBackupLoading = loadingSection === `Backup${section}`;
    const isRestoreLoading = loadingSection === `Restore${section}`;
    const isThisCardLoading = isBackupLoading || isRestoreLoading;

    return (
      <div className={`bg-gray-900 rounded-lg p-4 shadow-lg flex flex-col border transition-colors ${isThisCardLoading ? 'border-blue-500' : 'border-gray-700'}`}>
        <h3 className="text-lg font-semibold text-white text-center mb-4">{title}</h3>
        
        {/* Backup Action */}
        <div className="flex-1 mb-4">
          <div className="flex items-center gap-2">
            <button 
                onClick={onBackup} 
                disabled={isGloballyLoading} 
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-10"
            >
                {isBackupLoading ? (
                <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Backing up to GCS...
                </>
                ) : 'Backup'}
            </button>
            <button onClick={() => onShowInfo(`Backup:${section}`)} title="Show backup API command" className="p-2 text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-md shrink-0 h-10">
                <InfoIcon />
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-gray-700"></div>
          <span className="flex-shrink mx-4 text-gray-500 text-xs uppercase">Or</span>
          <div className="flex-grow border-t border-gray-700"></div>
        </div>

        {/* Restore Action */}
        <div className="flex-1 mt-4">
          <p className="text-xs text-center text-gray-400 mb-2">Restore from GCS.</p>
          <div className="flex items-center gap-2">
            <select
                value={selectedBackup}
                onChange={(e) => onBackupSelectionChange(section, e.target.value)}
                disabled={isGloballyLoading}
                className="block w-full text-xs bg-gray-700 border border-gray-600 rounded-l-md text-white p-2 h-8 disabled:opacity-50"
            >
                <option value="">-- Select Backup File --</option>
                {availableBackups.map(file => (
                    <option key={file} value={file}>{file}</option>
                ))}
            </select>
            <div className="flex shrink-0">
                <button
                onClick={() => onRestore(section, processor)}
                disabled={isGloballyLoading || !selectedBackup}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center h-8"
                >
                {isRestoreLoading ? (
                    <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    </>
                ) : 'Restore'}
                </button>
                 <button onClick={() => onShowInfo(`Restore:${section}`)} title="Show restore API command" className="p-1.5 text-gray-400 bg-gray-700 hover:bg-gray-600 rounded-r-md h-8">
                    <InfoIcon />
                </button>
            </div>
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
    reasoningEngineId: '', // Added Agent Engine selection
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  // GCS State
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
  
  // Available Backup Files (Keyed by section prefix)
  const [backupFiles, setBackupFiles] = useState<Record<string, string[]>>({});
  const [selectedRestoreFiles, setSelectedRestoreFiles] = useState<Record<string, string>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  const [modalData, setModalData] = useState<{
    section: string;
    title: string;
    items: any[];
    processor: (data: any) => Promise<void>;
    originalData: any;
  } | null>(null);
  
  const [secretPrompt, setSecretPrompt] = useState<{ auth: Authorization; resolve: (secret: string | null) => void; customMessage?: string; } | null>(null);
  
  const [infoModalKey, setInfoModalKey] = useState<string | null>(null);

  // State for dropdown options
  const [apps, setApps] = useState<AppEngine[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  
  const [reasoningEngines, setReasoningEngines] = useState<ReasoningEngine[]>([]);
  const [isLoadingReasoningEngines, setIsLoadingReasoningEngines] = useState(false);


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
        reasoningEngineId: '',
    }));
    setApps([]);
    setReasoningEngines([]);
    setBuckets([]);
    setSelectedBucket('');
  };
  
  const addLog = (message: string) => {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // --- Effects to fetch dropdown data ---
  
  // Fetch GCS Buckets
  useEffect(() => {
      if (!apiConfig.projectId) return;
      const fetchBuckets = async () => {
          setIsLoadingBuckets(true);
          setBuckets([]);
          try {
              const res = await api.listBuckets(apiConfig.projectId);
              const items = res.items || [];
              setBuckets(items);
              if (items.length > 0) {
                  // Default to first bucket if not set
                  if (!selectedBucket) setSelectedBucket(items[0].name);
              }
          } catch (e) {
              console.error("Failed to fetch buckets", e);
          } finally {
              setIsLoadingBuckets(false);
          }
      };
      fetchBuckets();
  }, [apiConfig.projectId]);

  const fetchBackups = async () => {
      if (!selectedBucket || !apiConfig.projectId) return;
      setIsLoadingFiles(true);
      setBackupFiles({}); // Clear while loading
      try {
          const res = await api.listGcsObjects(selectedBucket, '', apiConfig.projectId);
          const objects = res.items || [];
          
          // Categorize files based on prefixes
          const categorized: Record<string, string[]> = {
              'DiscoveryResources': [],
              'ReasoningEngine': [],
              'Assistant': [],
              'Agents': [],
              'DataStores': [],
              'Authorizations': [],
          };

          objects.forEach(obj => {
              if (obj.name.startsWith('agentspace-discovery-backup')) categorized['DiscoveryResources'].push(obj.name);
              else if (obj.name.startsWith('agentspace-reasoning-engine')) categorized['ReasoningEngine'].push(obj.name);
              else if (obj.name.startsWith('agentspace-assistant')) categorized['Assistant'].push(obj.name);
              else if (obj.name.startsWith('agentspace-agents')) categorized['Agents'].push(obj.name);
              else if (obj.name.startsWith('agentspace-data-stores')) categorized['DataStores'].push(obj.name);
              else if (obj.name.startsWith('agentspace-authorizations')) categorized['Authorizations'].push(obj.name);
          });

          // Sort chronologically (names contain ISO timestamp, so alphabetical reverse works)
          Object.keys(categorized).forEach(key => {
              categorized[key].sort().reverse();
          });

          setBackupFiles(categorized);
      } catch (e) {
          console.error("Failed to list objects", e);
          addLog(`Error listing backup files: ${(e as any).message}`);
      } finally {
          setIsLoadingFiles(false);
      }
  };

  // Fetch Backup Files when bucket changes
  useEffect(() => {
      fetchBackups();
  }, [selectedBucket, apiConfig.projectId]);


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

  // Fetch Agent Engines
  useEffect(() => {
    if(!apiConfig.projectId || !apiConfig.reasoningEngineLocation) return;
    const fetchREs = async () => {
        setIsLoadingReasoningEngines(true);
        setReasoningEngines([]);
        try {
            const res = await api.listReasoningEngines(apiConfig);
            const engines = res.reasoningEngines || [];
            setReasoningEngines(engines);
            // Auto select if only one
             if (engines.length === 1) {
                 const id = engines[0].name.split('/').pop() || '';
                 setConfig(p => ({...p, reasoningEngineId: id}));
             }
        } catch(e) { 
          console.error("Failed to fetch agent engines:", e); 
        } finally { 
            setIsLoadingReasoningEngines(false); 
        }
    }
    fetchREs();
  }, [apiConfig.projectId, apiConfig.reasoningEngineLocation]);


  const uploadBackupToGcs = async (data: object, filenamePrefix: string) => {
      if (!selectedBucket) {
          throw new Error("No GCS bucket selected for backup.");
      }
      const jsonString = JSON.stringify(data, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${filenamePrefix}-${timestamp}.json`;
      const file = new File([jsonString], filename, { type: 'application/json' });
      
      addLog(`Uploading backup to gs://${selectedBucket}/${filename}...`);
      await api.uploadFileToGcs(selectedBucket, filename, file, apiConfig.projectId);
      addLog(`Upload successful.`);
      
      // Refresh file list to show the new backup
      await fetchBackups();
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

  const pollOperation = async (operation: any, pollConfig: typeof apiConfig, resourceName: string, apiVersion: 'v1alpha' | 'v1beta' = 'v1beta') => {
    let currentOperation = operation;
    addLog(`  - Operation for ${resourceName} initiated (${currentOperation.name}). Polling for completion...`);
    while (!currentOperation.done) {
        await delay(5000); // Poll every 5 seconds
        currentOperation = await api.getDiscoveryOperation(currentOperation.name, pollConfig, apiVersion);
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
    await uploadBackupToGcs(backupData, 'agentspace-discovery-backup');
    addLog(`Backup complete! Found and backed up 'default_collection'.`);
  });
  
  const handleBackupReasoningEngine = async () => executeOperation('BackupReasoningEngine', async () => {
    if (!apiConfig.reasoningEngineId) {
      throw new Error("Target Agent Engine ID must be selected.");
    }
    const engineName = `projects/${apiConfig.projectId}/locations/${apiConfig.reasoningEngineLocation}/reasoningEngines/${apiConfig.reasoningEngineId}`;
    addLog(`Starting backup for Agent Engine: ${engineName}...`);
    
    const engine = await api.getReasoningEngine(engineName, apiConfig);
    
    const backupData = { type: 'ReasoningEngine', createdAt: new Date().toISOString(), sourceConfig: apiConfig, engine };
    await uploadBackupToGcs(backupData, `agentspace-reasoning-engine-${apiConfig.reasoningEngineId}-backup`);
    addLog(`Backup complete! Agent Engine '${engine.displayName}' saved.`);
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
    await uploadBackupToGcs(backupData, `agentspace-assistant-${apiConfig.assistantId}-backup`);
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
    await uploadBackupToGcs(backupData, `agentspace-agents-${apiConfig.assistantId}-backup`);
    addLog(`Backup complete! Found ${agents.length} agents.`);
  });

  const handleBackupDataStores = async () => executeOperation('BackupDataStores', async () => {
    addLog('Starting Data Stores backup for default_collection...');
    const dataStoresResponse = await api.listResources('dataStores', apiConfig);
    const dataStores: DataStore[] = dataStoresResponse.dataStores || [];
    
    const backupData = { type: 'DataStores', createdAt: new Date().toISOString(), sourceConfig: apiConfig, dataStores };
    await uploadBackupToGcs(backupData, 'agentspace-data-stores-backup');
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
      await uploadBackupToGcs(backupData, 'agentspace-authorizations-backup');
      addLog(`Backup complete! Found ${authorizations.length} authorizations (client secrets omitted).`);
  });


  // --- Restore Handlers & Processors ---

  const handleRestore = async (section: string, processor: (data: any) => Promise<void>) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) {
      setError(`Please select a bucket and a backup file for ${section}.`);
      return;
    }
    
    const sectionName = section.replace(/[A-Z]/g, ' $&').trim(); // e.g., 'DiscoveryResources' -> 'Discovery Resources'
    executeOperation(`Restore${section}`, async () => {
      addLog(`Downloading file: gs://${selectedBucket}/${filename}...`);
      
      const fileContent = await api.getGcsObjectContent(selectedBucket, filename, apiConfig.projectId);
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
          case 'ReasoningEngine':
              // It's a single item select for now
              dataToRestore.engine = items.length > 0 ? items[0] : null; 
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
                      const enginePayload: any = {
                          displayName: engine.displayName,
                          solutionType: engine.solutionType || 'SOLUTION_TYPE_SEARCH',
                          dataStoreIds: engine.dataStoreIds,
                          ...(engine.searchEngineConfig && { searchEngineConfig: engine.searchEngineConfig }),
                          ...(engine.industryVertical && { industryVertical: engine.industryVertical }),
                          ...(engine.appType && { appType: engine.appType }),
                      };
                      
                      const engineOperation = await api.createEngine(engineId, enginePayload, engineRestoreConfig);
                      await pollOperation(engineOperation, engineRestoreConfig, `App/Engine '${engineId}'`, 'v1alpha');
                      addLog(`      - CREATED: App/Engine '${engineId}' with linked data store.`);

                  } catch (err: any) {
                      if (err.message && err.message.includes("ALREADY_EXISTS")) {
                          addLog(`      - INFO: App/Engine '${engineId}' already exists. Proceeding...`);
                      } else {
                          addLog(`      - ERROR: Failed to create App/Engine '${engineId}': ${err.message}`);
                          continue; // Skip to next engine
                      }
                  }

                  if (engine.assistants && engine.assistants.length > 0) {
                      addLog(`      - Restoring ${engine.assistants.length} assistant(s)...`);
                      for (const assistant of engine.assistants) {
                         await processRestoreAssistant({ assistant }, false);
                      }
                  }
              }
            }
        }
      }
    });
  };

  const processRestoreReasoningEngine = async (backupData: any) => {
    const { engine } = backupData;
    if (!engine) {
      addLog("No Agent Engine data found in backup file.");
      return;
    }
     setModalData({
      section: 'ReasoningEngine',
       title: 'Confirm Restore Agent Engine',
      items: [engine],
      originalData: backupData,
      processor: async (data) => {
        const engineToRestore = data.engine;
        if (!engineToRestore) return; // Should not happen

        addLog(`Restoring Agent Engine '${engineToRestore.displayName}' to ${apiConfig.reasoningEngineLocation}...`);
        
        try {
            const payload: any = {
                displayName: engineToRestore.displayName,
                description: engineToRestore.description,
                spec: engineToRestore.spec, // Contains GCS URIs
            };
            
            const operation = await api.createReasoningEngine(apiConfig, payload);
            addLog(`  - Operation started: ${operation.name}`);
            
            // Poll for completion
            let currentOp = operation;
            while (!currentOp.done) {
                await delay(10000); // Poll every 10 seconds (deployment takes time)
                try {
                    currentOp = await api.getVertexAiOperation(operation.name, apiConfig);
                    addLog(`    - Polling status: ${currentOp.done ? 'DONE' : 'IN_PROGRESS'}`);
                } catch (pollErr: any) {
                    console.warn("Polling error", pollErr);
                    addLog(`    - WARNING: Error polling operation: ${pollErr.message}. Retrying...`);
                }
            }

            if (currentOp.error) {
                 addLog(`  - ERROR: Restore failed: ${currentOp.error.message}`);
                 throw new Error(currentOp.error.message);
            } else {
              addLog(`  - SUCCESS: Agent Engine '${engineToRestore.displayName}' restored successfully.`);
                 // Optionally try to fetch the new resource to confirm
                 if (currentOp.response && currentOp.response.name) {
                     addLog(`  - Resource Name: ${currentOp.response.name}`);
                 }
            }
            
        } catch (err: any) {
          addLog(`  - ERROR: Failed to create Agent Engine: ${err.message}`);
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
      } else {
          const assistantToRestore = backupData.assistant;
          const assistantId = assistantToRestore.name.split('/').pop()!;
          const restoreConfig = { ...apiConfig, assistantId }; 

          const updateExistingAssistant = async () => {
              addLog(`  - INFO: Assistant '${assistantId}' already exists or is default. Attempting to update its settings from backup.`);
              try {
                  const assistantName = `projects/${restoreConfig.projectId}/locations/${restoreConfig.appLocation}/collections/${restoreConfig.collectionId}/engines/${restoreConfig.appId}/assistants/${assistantId}`;
                  const payload: any = {};
                  const updateMask: string[] = [];

                  if (assistantToRestore.displayName) {
                    payload.displayName = assistantToRestore.displayName;
                    updateMask.push('displayName');
                  }
                  if (assistantToRestore.generationConfig) {
                      payload.generationConfig = assistantToRestore.generationConfig;
                      updateMask.push('generationConfig');
                  }
                  
                  if (updateMask.length > 0) {
                    await api.updateAssistant(assistantName, payload, updateMask, restoreConfig);
                    addLog(`  - UPDATED: Assistant '${assistantId}' settings applied.`);
                  } else {
                    addLog(`  - INFO: No updatable settings found in backup for assistant '${assistantId}'.`);
                  }
              } catch (updateErr: any) {
                  addLog(`  - ERROR: Failed to update existing assistant '${assistantId}': ${updateErr.message}. Proceeding to restore agents anyway.`);
              }
          };

          if (assistantId === 'default_assistant') {
              await updateExistingAssistant();
          } else {
            // Logic for custom assistants
            addLog(`Restoring custom Assistant '${assistantToRestore.displayName}' (${assistantId}) into app '${restoreConfig.appId}'...`);
            try {
                await api.createAssistant(assistantId, { displayName: assistantToRestore.displayName }, restoreConfig);
                addLog(`  - CREATED: Assistant '${assistantId}'`);
            } catch (err: any) {
                if (err.message && err.message.includes("ALREADY_EXISTS")) {
                    await updateExistingAssistant();
                } else {
                    addLog(`  - ERROR: Failed to create assistant '${assistantId}': ${err.message}`);
                    throw err; // Stop if it's not an ALREADY_EXISTS error
                }
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
  
  const handleBackupSelectionChange = (section: string, value: string) => {
      setSelectedRestoreFiles(prev => ({ ...prev, [section]: value }));
  };

  const cardConfigs = [
    { section: 'DiscoveryResources', title: 'All Discovery Resources', backupHandler: handleBackupDiscovery, restoreProcessor: processRestoreDiscovery },
    { section: 'ReasoningEngine', title: 'Single Agent Engine', backupHandler: handleBackupReasoningEngine, restoreProcessor: processRestoreReasoningEngine },
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
      {infoModalKey && (
        <CurlInfoModal infoKey={infoModalKey} onClose={() => setInfoModalKey(null)} />
      )}

      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Configuration for Backup & Restore</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Target Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Target Location (Discovery)</label>
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
          
          <div>
            <label htmlFor="reasoningEngineLocation" className="block text-sm font-medium text-gray-400 mb-1">Agent Engine Location</label>
            <select name="reasoningEngineLocation" value={config.reasoningEngineLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                <option value="us-central1">us-central1</option>
                <option value="europe-west1">europe-west1</option>
                <option value="asia-east1">asia-east1</option>
            </select>
          </div>
          <div>
            <label htmlFor="reasoningEngineId" className="block text-sm font-medium text-gray-400 mb-1">Target Agent Engine</label>
             <select name="reasoningEngineId" value={config.reasoningEngineId} onChange={handleConfigChange} disabled={isLoadingReasoningEngines || reasoningEngines.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingReasoningEngines ? 'Loading...' : '-- Select Engine --'}</option>
              {reasoningEngines.map(re => {
                  const id = re.name.split('/').pop() || '';
                  return <option key={re.name} value={id}>{re.displayName} ({id})</option>
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Backup Bucket (GCS)</label>
            <div className="flex gap-2">
                <select 
                    value={selectedBucket} 
                    onChange={(e) => setSelectedBucket(e.target.value)} 
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 h-[42px]"
                    disabled={isLoadingBuckets || buckets.length === 0}
                >
                    <option value="">{isLoadingBuckets ? 'Loading buckets...' : '-- Select Bucket --'}</option>
                    {buckets.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                </select>
            </div>
          </div>
        </div>
      </div>
      
       <div className="space-y-4">
          <h2 className="text-xl font-bold text-white text-center">Backup & Restore Actions (GCS)</h2>
          <p className="text-center text-gray-400 text-sm -mt-2">
              Backups are stored in <strong>gs://{selectedBucket || '...'}</strong>. Select a file from the dropdown to restore.
          </p>
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
                    availableBackups={backupFiles[card.section] || []}
                    selectedBackup={selectedRestoreFiles[card.section] || ''}
                    onBackupSelectionChange={handleBackupSelectionChange}
                    loadingSection={loadingSection}
                    isGloballyLoading={isLoading || isLoadingFiles}
                    onShowInfo={setInfoModalKey}
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
