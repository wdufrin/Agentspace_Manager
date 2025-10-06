import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Agent, Config, SortableAgentKey, SortDirection } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AgentList from '../components/agents/AgentList';
import AgentForm from '../components/agents/AgentForm';
import AgentDetails from '../components/agents/AgentDetails';
import ProjectInput from '../components/ProjectInput';
import ConfirmationModal from '../components/ConfirmationModal';

type ViewMode = 'list' | 'form' | 'details';

interface AgentsPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('agentsPageConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.projectNumber; // Ensure project number isn't part of this state
      return parsed;
    }
  } catch (e) {
    console.error("Failed to parse config from sessionStorage", e);
    sessionStorage.removeItem('agentsPageConfig');
  }
  return {
    appId: '',
    appLocation: 'global',
    collectionId: '',
    assistantId: '',
  };
};

const AgentsPage: React.FC<AgentsPageProps> = ({ accessToken, projectNumber, setProjectNumber }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  // Configuration state
  const [config, setConfig] = useState(getInitialConfig);
  const [sortConfig, setSortConfig] = useState<{ key: SortableAgentKey; direction: SortDirection }>({ key: 'displayName', direction: 'asc' });

  // State for dropdown options and their loading status
  const [collections, setCollections] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [assistants, setAssistants] = useState<any[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [isLoadingAssistants, setIsLoadingAssistants] = useState(false);

  // Save config to session storage on change
  useEffect(() => {
    sessionStorage.setItem('agentsPageConfig', JSON.stringify(config));
  }, [config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
        const newConfig = { ...prev, [name]: value };
        // Reset children when parent changes
        if (name === 'appLocation') {
            newConfig.collectionId = '';
            newConfig.appId = '';
            newConfig.assistantId = '';
            setCollections([]);
            setApps([]);
            setAssistants([]);
        }
        if (name === 'collectionId') {
            newConfig.appId = '';
            newConfig.assistantId = '';
            setApps([]);
            setAssistants([]);
        }
        if (name === 'appId') {
            newConfig.assistantId = '';
            setAssistants([]);
        }
        return newConfig;
    });
  };
  
  const handleProjectNumberChange = (newValue: string) => {
    setProjectNumber(newValue);
    // Reset dependent fields when project changes
    setConfig(prev => ({
        ...prev,
        collectionId: '',
        appId: '',
        assistantId: '',
    }));
    setCollections([]);
    setApps([]);
    setAssistants([]);
  };

  const apiConfig: Config = useMemo(() => ({
      ...config,
      accessToken,
      projectId: projectNumber,
  }), [config, accessToken, projectNumber]);

  // --- Effects to fetch dropdown data ---

  useEffect(() => {
    if (!apiConfig.projectId || !apiConfig.appLocation || !apiConfig.accessToken) {
        setCollections([]);
        return;
    }
    const fetchCollections = async () => {
        setIsLoadingCollections(true);
        setCollections([]);
        try {
            const response = await api.listResources('collections', apiConfig);
            const fetchedCollections = response.collections || [];
            setCollections(fetchedCollections);
            // Auto-select if there is only one option
            if (fetchedCollections.length === 1) {
                const singleCollectionId = fetchedCollections[0].name.split('/').pop();
                if (singleCollectionId) {
                    setConfig(prev => ({ ...prev, collectionId: singleCollectionId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch collections:", err);
            setError("Failed to fetch collections.");
        } finally {
            setIsLoadingCollections(false);
        }
    };
    fetchCollections();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.accessToken]);

  useEffect(() => {
    if (!config.collectionId || !apiConfig.projectId || !apiConfig.appLocation || !apiConfig.accessToken) {
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
            // Auto-select if there is only one option
            if (fetchedApps.length === 1) {
                const singleAppId = fetchedApps[0].name.split('/').pop();
                if (singleAppId) {
                    setConfig(prev => ({ ...prev, appId: singleAppId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch apps:", err);
            setError("Failed to fetch apps/engines.");
        } finally {
            setIsLoadingApps(false);
        }
    };
    fetchApps();
  }, [config.collectionId, apiConfig.projectId, apiConfig.appLocation, apiConfig.accessToken]);
  
  useEffect(() => {
    if (!config.appId || !config.collectionId || !apiConfig.projectId || !apiConfig.appLocation || !apiConfig.accessToken) {
        setAssistants([]);
        return;
    }
    const fetchAssistants = async () => {
        setIsLoadingAssistants(true);
        setAssistants([]);
        try {
            const response = await api.listResources('assistants', apiConfig);
            const fetchedAssistants = response.assistants || [];
            setAssistants(fetchedAssistants);
            // Auto-select if there is only one option
            if (fetchedAssistants.length === 1) {
                const singleAssistantId = fetchedAssistants[0].name.split('/').pop();
                if (singleAssistantId) {
                    setConfig(prev => ({ ...prev, assistantId: singleAssistantId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch assistants:", err);
            setError("Failed to fetch assistants.");
        } finally {
            setIsLoadingAssistants(false);
        }
    };
    fetchAssistants();
  }, [config.appId, config.collectionId, apiConfig.projectId, apiConfig.appLocation, apiConfig.accessToken]);

  const fetchAgents = useCallback(async () => {
    if (!apiConfig.accessToken || !apiConfig.projectId || !apiConfig.assistantId) {
      setAgents([]);
      if (apiConfig.projectId && apiConfig.assistantId) {
        setError("Access Token is required to list agents.");
      }
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listResources('agents', apiConfig);
      setAgents(response.agents || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch agents.');
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig]);

  useEffect(() => {
    if (config.assistantId) {
      fetchAgents();
    } else {
      setAgents([]); // Clear agents if assistant isn't selected
    }
  }, [fetchAgents, config.assistantId]);

  const handleToggleStatus = async (agent: Agent) => {
    const agentId = agent.name.split('/').pop() || '';
    setTogglingAgentId(agentId);
    setError(null);
    try {
      const updatedAgent = agent.state === 'ENABLED'
        ? await api.disableAgent(agent.name, apiConfig)
        : await api.enableAgent(agent.name, apiConfig);

      setAgents(prev => prev.map(a => a.name === updatedAgent.name ? updatedAgent : a));
      if (selectedAgent?.name === updatedAgent.name) {
          setSelectedAgent(updatedAgent);
      }
    } catch (err: any) {
      setError(err.message || `Failed to toggle status for agent ${agentId}.`);
    } finally {
      setTogglingAgentId(null);
    }
  };

  const requestDelete = (agent: Agent) => {
    setAgentToDelete(agent);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!agentToDelete) return;

    const agentId = agentToDelete.name.split('/').pop() || '';
    setDeletingAgentId(agentId);
    setIsDeleteModalOpen(false);
    setError(null);
    try {
      await api.deleteResource(agentToDelete.name, apiConfig);
      fetchAgents(); // Refresh the list
    } catch (err: any) {
      setError(err.message || `Failed to delete agent ${agentId}.`);
    } finally {
      setDeletingAgentId(null);
      setAgentToDelete(null);
    }
  };

  const handleFormSuccess = () => {
    setViewMode('list');
    fetchAgents();
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setViewMode('details');
  };

  const handleEditAgent = (agent: Agent) => {
      setSelectedAgent(agent);
      setViewMode('form');
  };

  const handleSort = (key: SortableAgentKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedAgents = useMemo(() => {
    if (!agents) return [];
    return [...agents].sort((a, b) => {
      // Handle potentially undefined state property for private agents
      const aVal = a.state ? (a[sortConfig.key] || '') : (sortConfig.key === 'state' ? 'private' : a[sortConfig.key] || '');
      const bVal = b.state ? (b[sortConfig.key] || '') : (sortConfig.key === 'state' ? 'private' : b[sortConfig.key] || '');
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [agents, sortConfig]);

  const renderContent = () => {
    if (!accessToken) {
      return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token to begin.</div>;
    }
    
    if (isLoading && agents.length === 0) {
      return <Spinner />;
    }

    switch (viewMode) {
      case 'form':
        return <AgentForm config={apiConfig} onSuccess={handleFormSuccess} onCancel={() => setViewMode('list')} agentToEdit={selectedAgent} />;
      case 'details':
        return selectedAgent ? <AgentDetails 
            agent={selectedAgent} 
            config={apiConfig}
            onBack={() => { setViewMode('list'); setSelectedAgent(null); }} 
            onEdit={() => setViewMode('form')}
            onDeleteSuccess={() => { setViewMode('list'); fetchAgents(); }}
            onToggleStatus={handleToggleStatus}
            togglingAgentId={togglingAgentId}
            error={error}
        /> : null;
      case 'list':
      default:
        return (
          <>
            {error && !isLoading && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
            <AgentList
              agents={sortedAgents}
              onSelectAgent={handleSelectAgent}
              onEditAgent={handleEditAgent}
              onDeleteAgent={requestDelete}
              onRegisterNew={() => { setSelectedAgent(null); setViewMode('form'); }}
              onToggleAgentStatus={handleToggleStatus}
              togglingAgentId={togglingAgentId}
              deletingAgentId={deletingAgentId}
              onSort={handleSort}
              sortConfig={sortConfig}
            />
          </>
        );
    }
  };

 return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} accessToken={accessToken} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
            <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="collectionId" className="block text-sm font-medium text-gray-400 mb-1">Collection ID</label>
            <select name="collectionId" value={config.collectionId} onChange={handleConfigChange} disabled={isLoadingCollections || collections.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingCollections ? 'Loading...' : '-- Select a Collection --'}</option>
              {collections.map(c => {
                  const collectionId = c.name.split('/').pop() || '';
                  return <option key={c.name} value={collectionId}>{c.displayName || collectionId}</option>
              })}
            </select>
          </div>
          <div>
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">App / Engine ID</label>
            <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select an App --'}</option>
              {apps.map(a => {
                  const appId = a.name.split('/').pop() || '';
                  return <option key={a.name} value={appId}>{a.displayName || appId}</option>
              })}
            </select>
          </div>
          <div>
            <label htmlFor="assistantId" className="block text-sm font-medium text-gray-400 mb-1">Assistant ID</label>
            <select name="assistantId" value={config.assistantId} onChange={handleConfigChange} disabled={isLoadingAssistants || assistants.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingAssistants ? 'Loading...' : '-- Select an Assistant --'}</option>
              {assistants.map(a => {
                  const assistantId = a.name.split('/').pop() || '';
                  return <option key={a.name} value={assistantId}>{a.displayName || assistantId}</option>
              })}
            </select>
          </div>
          {viewMode === 'list' && (
             <div className="flex items-end">
                <button 
                    onClick={fetchAgents} 
                    disabled={isLoading}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                >
                    {isLoading ? 'Loading...' : 'Refresh Agents'}
                </button>
             </div>
          )}
        </div>
      </div>
      {renderContent()}

      {agentToDelete && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDelete}
            title="Confirm Agent Deletion"
            confirmText="Delete"
            isConfirming={!!deletingAgentId}
        >
            <p>Are you sure you want to permanently delete this agent?</p>
            <div className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600">
                <p className="font-bold text-white">{agentToDelete.displayName}</p>
                <p className="text-xs font-mono text-gray-400 mt-1">{agentToDelete.name.split('/').pop()}</p>
            </div>
            <p className="mt-4 text-sm text-yellow-300">This action cannot be undone.</p>
        </ConfirmationModal>
      )}
    </div>
  );
};

export default AgentsPage;