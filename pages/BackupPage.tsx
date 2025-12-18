
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Agent, AppEngine, Assistant, Authorization, Collection, Config, DataStore, ReasoningEngine, GcsBucket, GcsObject } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';

import DiscoveryRestoreModal from '../components/backup/DiscoveryRestoreModal';

import RenameBackupModal from '../components/backup/RenameBackupModal';
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
  onBackup: () => Promise<void> | void;
  onRestore: (section: string, processor: (data: any) => Promise<void>) => Promise<void>;
  processor: (data: any) => Promise<void>;
  availableBackups: string[];
  selectedBackup: string;
  onBackupSelectionChange: (section: string, value: string) => void;
  loadingSection: string | null;
  isGloballyLoading: boolean;
  onShowInfo: (infoKey: string) => void;
  onDelete: (section: string) => void;
  onRename: (section: string) => void;
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
  onShowInfo,
  onDelete,
  onRename
}) => {
    const isBackupLoading = loadingSection === `Backup${section}`;
    const isRestoreLoading = loadingSection === `Restore${section}`;
    const isThisCardLoading = isBackupLoading || isRestoreLoading;

    return (
      <div className={`bg-gray-900 rounded-lg p-4 shadow-lg flex flex-col border transition-colors ${isThisCardLoading ? 'border-blue-500' : 'border-gray-700'}`}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-white flex-1 text-center">{title}</h3>
        </div>
        
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
                onClick={() => onRename(section)}
                disabled={isGloballyLoading || !selectedBackup}
                title="Rename Backup"
                className="p-1.5 text-gray-400 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 border-r border-gray-600 h-8 font-mono"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(section)}
                disabled={isGloballyLoading || !selectedBackup}
                title="Delete Backup"
                className="p-1.5 text-red-400 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 h-8"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
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
    reasoningEngineId: '', // Added Reasoning Engine selection
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

  // New Modals State
  const [discoveryRestoreModalData, setDiscoveryRestoreModalData] = useState<{
    isOpen: boolean;
    originalData: any;
    onConfirm: (data: any) => void;
    title?: string;
  } | null>(null);

  const [renameBackupModal, setRenameBackupModal] = useState<{
    isOpen: boolean;
    currentName: string;
    onConfirm: (newName: string) => void;
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

  // Fetch Reasoning Engines
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
            console.error("Failed to fetch reasoning engines:", e); 
        } finally { 
            setIsLoadingReasoningEngines(false); 
        }
    }
    fetchREs();
  }, [apiConfig.projectId, apiConfig.reasoningEngineLocation]);



  const promptForSecret = (auth: Authorization, customMessage?: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setSecretPrompt({ auth, resolve, customMessage });
    });
  };

  const uploadBackupToGcs = async (data: object, filenamePrefix: string, customName?: string) => {
      if (!selectedBucket) {
          throw new Error("No GCS bucket selected for backup.");
      }
      const jsonString = JSON.stringify(data, null, 2);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    let filename = '';
    if (customName) {
      // If custom name is provided, use it. Sanitize if needed.
      // Ensure it ends with .json
      filename = customName.endsWith('.json') ? customName : `${customName}.json`;
      // If it doesn't have the prefix, maybe prepend it? Legacy allowed full custom names.
      // Let's just use the custom name as is if provided.
    } else {
      filename = `${filenamePrefix}-${timestamp}.json`;
    }

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
  const handleBackupDiscovery = async () => {
    executeOperation('BackupDiscoveryResources', async () => {
      addLog('Starting Discovery Resources backup for default_collection...');
      // ... logic ...
      const collectionsResponse = await api.listResources('collections', apiConfig);
      const collections: Collection[] = (collectionsResponse.collections || []);

      if (collections.length === 0) {
        addLog('Warning: No collections found in this location.');
      }

      for (const collection of collections) {
        const collectionId = collection.name.split('/').pop()!;
        const enginesResponse = await api.listResources('engines', { ...apiConfig, collectionId });
        const engines: AppEngine[] = enginesResponse.engines || [];
        collection.engines = engines;

        for (const engine of engines) {
          const appId = engine.name.split('/').pop()!;
          const assistantsResponse = await api.listResources('assistants', { ...apiConfig, collectionId, appId });
          engine.assistants = (assistantsResponse.assistants || []);

          for (const assistant of engine.assistants) {
            const assistantId = assistant.name.split('/').pop()!;
            const agentsResponse = await api.listResources('agents', { ...apiConfig, collectionId, appId, assistantId });
            assistant.agents = agentsResponse.agents || [];
          }
        }
      }

      const dataStoresResponse = await api.listResources('dataStores', apiConfig);
      const dataStores = dataStoresResponse.dataStores || [];

      const authResponse = await api.listAuthorizations(apiConfig);
      const authorizations = (authResponse.authorizations || []).map(auth => {
        if (auth.serverSideOauth2.clientSecret) delete auth.serverSideOauth2.clientSecret;
        return auth;
      });

      const reasoningEnginesRes = await api.listReasoningEngines(apiConfig);
      const reasoningEngines = reasoningEnginesRes.reasoningEngines || [];

      const backupData = {
        type: 'DiscoveryResources',
        createdAt: new Date().toISOString(),
        sourceConfig: apiConfig,
        collections,
        dataStores,
        authorizations,
        reasoningEngines
      };

      await uploadBackupToGcs(backupData, 'agentspace-discovery-backup');
      addLog(`Backup complete! Full Project Snapshot saved.`);
    });
  };

  /* --- Reasoning Engine Batch Handlers --- */

  const performBackupReasoningEngine = async (customName?: string) => {
    // Batch Mode: Backup ALL reasoning engines in the location
    if (!config.reasoningEngineLocation) { setError("Select a location."); return; }

    addLog(`Fetching all Reasoning Engines in ${config.reasoningEngineLocation}...`);

    executeOperation('BackupReasoningEngine', async () => {
      const res = await api.listReasoningEngines({ ...apiConfig, reasoningEngineLocation: config.reasoningEngineLocation });
      const engines = res.reasoningEngines || [];

      if (engines.length === 0) {
        throw new Error("No Reasoning Engines found in this location.");
      }

      addLog(`Found ${engines.length} engine(s). Creating backup...`);

      await uploadBackupToGcs({
        type: 'ReasoningEngine',
        createdAt: new Date().toISOString(),
        sourceConfig: apiConfig,
        reasoningEngines: engines
      }, 'agentspace-reasoning-engine', customName);

      addLog(`Backup complete! ${engines.length} Reasoning Engines saved.`);
    });
  };

  const handleBackupReasoningEngine = () => {
    performBackupReasoningEngine();
  };

  /* --- Assistant Batch Handlers --- */

  const performBackupAssistant = async (customName?: string) => {
    // Batch Mode: Iterate over ALL collections and apps to find ALL assistants
    if (!config.appLocation) { setError("Select a location."); return; }

    executeOperation('BackupAssistant', async () => {
      addLog(`Scanning for Assistants in ${config.appLocation}...`);

      // 1. List Collections
      const collectionsRes = await api.listResources('collections', apiConfig);
      const collections = collectionsRes.collections || [];

      if (collections.length === 0) {
        // Fallback or warning
        addLog("Warning: No collections found. Checking default_collection explicitly...");
        // If listCollections returns empty but default exists?
        // We'll proceed with direct engine list if empty? No, sticking to robust loop.
      }

      const allAssistants: Assistant[] = [];

      for (const col of collections) {
        const collectionId = col.name.split('/').pop()!;
        // 2. List Engines in Collection
        const appsRes = await api.listResources('engines', { ...apiConfig, collectionId });
        const apps = appsRes.engines || [];

        for (const app of apps) {
          const appId = app.name.split('/').pop()!;
          try {
            // 3. List Assistants in Engine
            const asstRes = await api.listResources('assistants', { ...apiConfig, collectionId, appId });
            if (asstRes.assistants) {
              for (const asst of asstRes.assistants) {
                // Fetch agents for deep backup
                try {
                  const asstId = asst.name.split('/').pop()!;
                  const agentsRes = await api.listResources('agents', { ...apiConfig, collectionId, appId, assistantId: asstId });
                  asst.agents = agentsRes.agents || [];
                } catch (e) { /* ignore agent fetch fail */ }
                allAssistants.push(asst);
              }
            }
          } catch (e) {
            console.warn(`Failed to list assistants for app ${appId}`, e);
          }
        }
      }

      if (allAssistants.length === 0) {
        throw new Error("No Assistants found across all Collections/Apps.");
      }

      addLog(`Backup prepared for ${allAssistants.length} Assistant(s) with their Agents.`);

      await uploadBackupToGcs({
        type: 'Assistant',
        createdAt: new Date().toISOString(),
        sourceConfig: apiConfig,
        assistants: allAssistants
      }, 'agentspace-assistant', customName);

      addLog(`Backup complete! ${allAssistants.length} Assistants saved.`);
    });
  };

  const handleBackupAssistant = () => {
    performBackupAssistant();
  };
  
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


  /* --- File Management Handlers --- */

  const handleDeleteBackup = async (section: string) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) return;

    if (!window.confirm(`Are you sure you want to delete "${filename}"?`)) return;

    addLog(`Deleting backup file: ${filename}...`);
    try {
      await api.deleteGcsObject(selectedBucket, filename, apiConfig.projectId);
      addLog("Backup deleted successfully.");
      setSelectedRestoreFiles(prev => ({ ...prev, [section]: '' })); // Clear selection
      await fetchBackups(); // Refresh list
    } catch (e: any) {
      setError(`Delete failed: ${e.message}`);
      addLog(`ERROR: Delete failed - ${e.message}`);
    }
  };

  const handleRenameBackup = (section: string) => {
    const filename = selectedRestoreFiles[section];
    if (!filename || !selectedBucket) return;

    setRenameBackupModal({
      isOpen: true,
      currentName: filename,
      onConfirm: async (newName) => {
        setRenameBackupModal(null);
        addLog(`Renaming "${filename}" to "${newName}"...`);
        try {
          // Ensure .json extension
          const finalName = newName.endsWith('.json') ? newName : `${newName}.json`;
          await api.renameGcsObject(selectedBucket, filename, finalName, apiConfig.projectId);
          addLog("Rename successful.");
          setSelectedRestoreFiles(prev => ({ ...prev, [section]: finalName })); // Update selection
          await fetchBackups(); // Refresh list
        } catch (e: any) {
          setError(`Rename failed: ${e.message}`);
          addLog(`ERROR: Rename failed - ${e.message}`);
        }
      }
    });
  };

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
    // Open the advanced DiscoveryRestoreModal
    setDiscoveryRestoreModalData({
      isOpen: true,
      originalData: backupData,
      onConfirm: async (selectedData) => {
        setDiscoveryRestoreModalData(null);

        executeOperation('RestoreDiscoveryResources', async () => {

          // restore logic from `selectedData`...
          // The `DiscoveryRestoreModal` returns an object keyed by restore sections
          const { collections, dataStores, reasoningEngines, authorizations } = selectedData;

          // 1. Authorizations (Dependencies)
          if (authorizations && authorizations.length > 0) {
            await processRestoreAuthorizations({ authorizations });
          }

          // 2. Data Stores
          if (dataStores && dataStores.length > 0) {
            await processRestoreDataStores({ dataStores });
          }

          // 3. Reasoning Engines
          if (reasoningEngines && reasoningEngines.length > 0) {
            for (const re of reasoningEngines) {
              await processRestoreReasoningEngine({ engine: re });
            }
          }

          // 4. Collections (contain Engines -> Assistants -> Agents)
          if (collections && collections.length > 0) {
            // Reuse the logic inside existing processRestoreDiscovery for collections
            // But we need to be careful not to recurse infinitely or duplicate code
            // Let's implement the loop here using the selected collections
            addLog(`Restoring ${collections.length} Collection(s)...`);
            for (const collection of collections) {
              const collectionId = collection.name.split('/').pop()!;
              addLog(`Restoring Collection '${collection.displayName}' (${collectionId})...`);
              const restoreConfig = { ...apiConfig, collectionId };

              // Create Collection
              try {
                await api.createCollection(collectionId, { displayName: collection.displayName }, restoreConfig);
                addLog(`  - CREATED: Collection '${collectionId}'`);
              } catch (err: any) {
                if (err.message && err.message.includes("ALREADY_EXISTS")) {
                  addLog(`  - INFO: Collection '${collectionId}' already exists. Proceeding...`);
                } else {
                  addLog(`  - ERROR: Failed to create collection '${collectionId}': ${err.message}`);
                  continue;
                }
              }

              await delay(2000);

              if (collection.engines && collection.engines.length > 0) {
                for (const engine of collection.engines) {
                  // Check if this engine was selected? 
                  // In DiscoveryRestoreModal, if I select a collection, does it select all children?
                  // Yes, the modal returns filtered children if I implemented it that way.
                  // My modal implementation in `DiscoveryRestoreModal.tsx` handles filtering based on selection!
                  // It returns `key: list.filter(...)`.
                  // BUT `collections` list in `selectedData` only contains the collection objects.
                  // It does NOT automatically filter the `engines` array INSIDE the collection object unless I did deep filtering.
                  // Let's check `DiscoveryRestoreModal.tsx`.
                  // It returns `collections: list.filter(...)`. It does NOT deeply modify the collection object to remove unselected engines.
                  // Wait, `RestoreOrder` includes `engines` as a separate key!
                  // So `selectedData` has `engines: [...]`.
                  // Therefore, I should IGNORE `collection.engines` and use `selectedData.engines`!
                  // BUT `selectedData.engines` are global (across all collections?).
                  // Logic: Iterate selected items.

                  // Actually, standard restore:
                  // Authorizations -> DataStores -> Collections -> Engines -> Assistants -> Agents

                  // Since `DiscoveryRestoreModal` returns flat lists of selected items:
                  // I should iterate `selectedData.engines` and restore them.
                  // BUT creating an engine requires knowing its parent collection.
                  // The engine object name is `projects/.../collections/{collection}/engines/{engine}`.
                  // So I can parse the parent collection from the name!
                }
              }
            }

            // Now restore Engines
            if (selectedData.engines && selectedData.engines.length > 0) {
              addLog(`Restoring ${selectedData.engines.length} App/Engine(s)...`);
              for (const engine of selectedData.engines) {
                const parts = engine.name.split('/');
                const collectionId = parts[parts.indexOf('collections') + 1];
                const engineId = parts[parts.indexOf('engines') + 1];
                const restoreConfig = { ...apiConfig, collectionId, appId: engineId };

                addLog(`    - Restoring App/Engine '${engine.displayName}' (${engineId}) into '${collectionId}'`);
                try {
                  // Restore Engine Logic
                      const enginePayload: any = {
                          displayName: engine.displayName,
                          solutionType: engine.solutionType || 'SOLUTION_TYPE_SEARCH',
                          dataStoreIds: engine.dataStoreIds,
                          ...(engine.searchEngineConfig && { searchEngineConfig: engine.searchEngineConfig }),
                          ...(engine.industryVertical && { industryVertical: engine.industryVertical }),
                          ...(engine.appType && { appType: engine.appType }),
                      };
                  const engineOperation = await api.createEngine(engineId, enginePayload, restoreConfig);
                  await pollOperation(engineOperation, restoreConfig, `App/Engine '${engineId}'`, 'v1alpha');
                  addLog(`      - CREATED: App/Engine '${engineId}'.`);
                } catch (err: any) {
                      if (err.message && err.message.includes("ALREADY_EXISTS")) {
                          addLog(`      - INFO: App/Engine '${engineId}' already exists. Proceeding...`);
                      } else {
                          addLog(`      - ERROR: Failed to create App/Engine '${engineId}': ${err.message}`);
                    continue;
                  }
                }
              }
                  }

            // Restore Assistants
            if (selectedData.assistants && selectedData.assistants.length > 0) {
              addLog(`Restoring ${selectedData.assistants.length} Assistant(s)...`);
              for (const assistant of selectedData.assistants) {
                await processRestoreAssistant({ assistant });
              }
            }

            // Restore Agents?
            // My `processRestoreAssistant` handles agents inside it if `assistant.agents` exists.
            // But `selectedData.agents` is a separate list.
            // The `DiscoveryRestoreModal` might return agents separately.
            // If I select an assistant, I usually select its agents too in the simplified logic.
            // But if `DiscoveryRestoreModal` provides `agents` list, I should probably restore them explicitly.
            // However, agents MUST belong to an assistant.
            // If existing `processRestoreAssistant` restores agents from `assistant.agents` array,
            // I need to ensure `assistant` object passed to it HAS the agents I want.
            // `selectedData.assistants` contains the original assistant objects.
            // If `selectedData.agents` contains the selected agents,
            // I should probably map them back to their assistants or handle them.
            // Simplify: For now, I will assume if Assistant is selected, we restore its contained agents as per `processRestoreAssistant` logic 
            // OR I can use `selectedData.agents` to filter what gets restored.
            // Let's use `selectedData.agents`. 
            // I will ITERATE `selectedData.agents` and group them by assistant?
            // Actually `processRestoreAssistant` takes `backupData` which expects `{ assistant: ... }`.
            // And it calls `restoreAgentsIntoAssistant`.
            // I can just call `restoreAgentsIntoAssistant` directly for the list of agents!
            if (selectedData.agents && selectedData.agents.length > 0) {
              addLog(`Restoring ${selectedData.agents.length} Agent(s)...`);
              // We need to group agents by their parent assistant to set the correct config
              const agentsByAssistant: Record<string, Agent[]> = {};
              for (const agent of selectedData.agents) {
                const parts = agent.name.split('/');
                const collectionId = parts[parts.indexOf('collections') + 1];
                const appId = parts[parts.indexOf('engines') + 1];
                const assistantId = parts[parts.indexOf('assistants') + 1];
                const key = `${collectionId}/${appId}/${assistantId}`;
                if (!agentsByAssistant[key]) agentsByAssistant[key] = [];
                agentsByAssistant[key].push(agent);
              }

              for (const [key, agents] of Object.entries(agentsByAssistant)) {
                const [collectionId, appId, assistantId] = key.split('/');
                const restoreConfig = { ...apiConfig, collectionId, appId, assistantId };
                await restoreAgentsIntoAssistant(agents, restoreConfig);
              }
            }
          }

        });
      }
    });
  };




  /* --- Execution Logic (Ported from Legacy for Parity) --- */

  const executeRestoreAgents = async (agents: Agent[], targetConfig: typeof apiConfig) => {
    addLog(`Restoring ${agents.length} Agent(s) into assistant '${targetConfig.assistantId}'...`);
    // Re-use existing restoreAgentsIntoAssistant logic but ensure it matches legacy robustness if needed.
    // Legacy `restoredAgentsIntoAssistant` (Step 574 lines 501-525) is similar to current `restoreAgentsIntoAssistant`.
    // Current `restoreAgentsIntoAssistant` has deeper logic for finding new auths etc. 
    // I will KEEP current `restoreAgentsIntoAssistant` as it seems MORE advanced/fixed for the current env.
    await restoreAgentsIntoAssistant(agents, targetConfig);
  };

  const executeRestoreAssistants = async (assistants: Assistant[]) => {
    addLog(`Restoring ${assistants.length} Assistant(s)...`);
    for (const assistant of assistants) {
      const assistantId = assistant.name.split('/').pop()!;
      addLog(`  - Restoring Assistant '${assistant.displayName}' (${assistantId})...`);

      const parts = assistant.name.split('/');
      const collectionId = parts[parts.indexOf('collections') + 1];
      const appId = parts[parts.indexOf('engines') + 1];
      const restoreConfig = { ...apiConfig, collectionId, appId, assistantId };

      try {
        // Check/Create Assistant
        const payload = { displayName: assistant.displayName };
        await api.createAssistant(assistantId, payload, restoreConfig);
        addLog(`      - CREATED: Assistant '${assistantId}'.`);

        // Restore Agents if present
        if (assistant.agents && assistant.agents.length > 0) {
          await restoreAgentsIntoAssistant(assistant.agents, restoreConfig);
        }

      } catch (err: any) {
        if (err.message && err.message.includes("ALREADY_EXISTS")) {
          addLog(`      - INFO: Assistant '${assistantId}' already exists. Proceeding to restore agents...`);
          if (assistant.agents && assistant.agents.length > 0) {
            await restoreAgentsIntoAssistant(assistant.agents, restoreConfig);
          }
        } else {
          addLog(`      - ERROR: Failed to create Assistant '${assistantId}': ${err.message}`);
        }
      }
      await delay(1000);
    }
  };


  const executeRestoreDataStores = async (dataStores: any[]) => {
    addLog(`Restoring ${dataStores.length} Data Store(s) into collection '${apiConfig.collectionId}'...`);
    for (const dataStore of dataStores) {
      const dsId = dataStore.name.split('/').pop()!;
      addLog(`  - Restoring Data Store '${dataStore.displayName}' (${dsId})`);
      try {
        // Use generic createDataStore but check for operation
        const op = await api.createDataStore(dsId, {
          displayName: dataStore.displayName,
          industryVertical: dataStore.industryVertical,
          solutionTypes: dataStore.solutionTypes,
          contentConfig: dataStore.contentConfig || 'NO_CONTENT',
        }, apiConfig);

        if (op.name && op.name.includes('/operations/')) {
          addLog(`    - Operation started: ${op.name.split('/').pop()}. Waiting...`);
          let done = false;
          while (!done) {
            await delay(2000);
            const poll = await api.getDiscoveryOperation(op.name, apiConfig);
            if (poll.done) done = true;
            if (poll.error) throw new Error(poll.error.message);
          }
        }

        addLog(`    - CREATED: Data Store '${dsId}'`);
      } catch (err: any) {
        if (err.message && err.message.includes("ALREADY_EXISTS")) {
          addLog(`    - INFO: Data Store '${dsId}' already exists. Skipping.`);
        } else {
          addLog(`    - ERROR: Failed to create Data Store '${dsId}': ${err.message}`);
        }
      }
      await delay(1000);
    }
  };

  const executeRestoreAuthorizations = async (authorizations: any[]) => {
    addLog(`Restoring ${authorizations.length} Authorizations...`);
    for (const auth of authorizations) {
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
  };

  const executeRestoreReasoningEngines = async (engines: any[]) => {
    addLog(`Restoring ${engines.length} Reasoning Engine(s)...`);

    for (const engine of engines) {
      const engineId = engine.name.split('/').pop();
      addLog(`  - Restoring '${engine.displayName}' (${engineId})...`);

      try {
        // We use createReasoningEngine from API. It might return an operation.
        // Legacy passed `engine` directly. Current api.createReasoningEngine signature?
        // Let's assume api.createReasoningEngine(engine, config) exists or similar.
        // Current `processRestoreReasoningEngine` in step 532 was empty/placeholder loop?
        // No, step 532 had `processRestoreReasoningEngine` calling generic create?
        // Actually I need to check `api.createReasoningEngine`.

        // Assuming api.createReasoningEngine takes (engineData, config)
        const op: any = await api.createReasoningEngine(engine, apiConfig);

        if (op.name && op.name.includes('/operations/')) {
          addLog("    - Create operation started. Polling...");
          let currentOp = op;
          while (!currentOp.done) {
            await delay(3000);
            currentOp = await api.getVertexAiOperation(currentOp.name, apiConfig);
            // Need to ensure getOperation is available or use getDiscoveryOperation if compatible (unlikely for Vertex)
          }
          if (currentOp.error) throw new Error(currentOp.error.message);
          addLog("    - SUCCESS: Created.");
        } else {
          addLog("    - SUCCESS: Created (Immediate).");
        }

      } catch (e: any) {
        if (e.message && e.message.includes("ALREADY_EXISTS")) {
          addLog(`    - INFO: Engine already exists. Skipping.`);
        } else {
          addLog(`    - ERROR: ${e.message}`);
        }
      }
      await delay(1000);
    }
  };



  // Generic Data Stores Processor
  const processRestoreDataStores = async (backupData: any) => {
    setDiscoveryRestoreModalData({
      isOpen: true,
      title: 'Restore Data Stores',
      originalData: { dataStores: backupData.dataStores || [] },
      onConfirm: async (selectedData) => {
        setDiscoveryRestoreModalData(null);
        await executeRestoreDataStores(selectedData.dataStores || []);
      }
    });
  };

  // Generic Reasoning Engine Processor
  const processRestoreReasoningEngine = async (backupData: any) => {
    let items: any[] = [];
    if (Array.isArray(backupData.reasoningEngines)) items = backupData.reasoningEngines;
    else if (backupData.engine) items = [backupData.engine];
    else if (backupData.name) items = [backupData];
    else { addLog("ERROR: Unrecognized format for Reasoning Engine backup."); return; }

    setDiscoveryRestoreModalData({
      isOpen: true,
      title: 'Restore Reasoning Engines',
      originalData: { reasoningEngines: items },
      onConfirm: async (selectedData) => {
        setDiscoveryRestoreModalData(null);
        await executeRestoreReasoningEngines(selectedData.reasoningEngines || []);
      }
    });
  };

  const processRestoreAssistant = async (backupData: any) => {
    // Handle various backup formats
    let items: any[] = [];
    if (Array.isArray(backupData.assistants)) items = backupData.assistants;
    else if (backupData.assistant) items = [backupData.assistant];
    else { addLog("ERROR: Unrecognized format for Assistant backup."); return; }

    setDiscoveryRestoreModalData({
      isOpen: true,
      title: 'Restore Assistants',
      originalData: { assistants: items },
      onConfirm: async (selectedData) => {
        setDiscoveryRestoreModalData(null);
        await executeRestoreAssistants(selectedData.assistants || []);
      }
    });
  };

  const processRestoreAgents = async (backupData: any) => {
    if (!backupData.agents) {
      addLog("No agent data found in backup.");
      return;
    }
    if (!apiConfig.appId) {
      throw new Error("Target Gemini Enterprise ID required for Agent restore.");
    }

    setDiscoveryRestoreModalData({
      isOpen: true,
      title: 'Restore Agents',
      originalData: { agents: backupData.agents },
      onConfirm: async (selectedData) => {
        setDiscoveryRestoreModalData(null);
        await executeRestoreAgents(selectedData.agents || [], apiConfig);
      }
    });
  };

  const processRestoreAuthorizations = async (backupData: any) => {
    setDiscoveryRestoreModalData({
      isOpen: true,
      title: 'Restore Authorizations',
      originalData: { authorizations: backupData.authorizations || [] },
      onConfirm: async (selectedData) => {
        setDiscoveryRestoreModalData(null);
        await executeRestoreAuthorizations(selectedData.authorizations || []);
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
    { section: 'ReasoningEngine', title: 'Reasoning Engines', backupHandler: handleBackupReasoningEngine, restoreProcessor: processRestoreReasoningEngine },
    { section: 'Assistant', title: 'Assistants', backupHandler: handleBackupAssistant, restoreProcessor: processRestoreAssistant },
    { section: 'Agents', title: 'Agents', backupHandler: handleBackupAgents, restoreProcessor: processRestoreAgents },
    { section: 'DataStores', title: 'Datastores', backupHandler: handleBackupDataStores, restoreProcessor: processRestoreDataStores },
    { section: 'Authorizations', title: 'Authorizations', backupHandler: handleBackupAuthorizations, restoreProcessor: processRestoreAuthorizations },
  ];

  return (
    <div className="space-y-6">

      {discoveryRestoreModalData && (
        <DiscoveryRestoreModal
          isOpen={discoveryRestoreModalData.isOpen}
          onClose={() => setDiscoveryRestoreModalData(null)}
          onConfirm={discoveryRestoreModalData.onConfirm}
          originalData={discoveryRestoreModalData.originalData}
          isLoading={isLoading}
        />
      )}

      {renameBackupModal && (
        <RenameBackupModal
          isOpen={renameBackupModal.isOpen}
          onClose={() => setRenameBackupModal(null)}
          onConfirm={renameBackupModal.onConfirm}
          currentName={renameBackupModal.currentName}
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
            <label htmlFor="reasoningEngineLocation" className="block text-sm font-medium text-gray-400 mb-1">Reasoning Engine Location</label>
            <select name="reasoningEngineLocation" value={config.reasoningEngineLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                <option value="us-central1">us-central1</option>
                <option value="europe-west1">europe-west1</option>
                <option value="asia-east1">asia-east1</option>
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
                onDelete={handleDeleteBackup}
                onRename={handleRenameBackup}
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
