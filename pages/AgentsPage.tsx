
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Agent, Config, SortableAgentKey, SortDirection, Assistant } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AgentList from '../components/agents/AgentList';
import AgentForm from '../components/agents/AgentForm';
import AgentDetails from '../components/agents/AgentDetails';
import ProjectInput from '../components/ProjectInput';
import ConfirmationModal from '../components/ConfirmationModal';

type ViewMode = 'list' | 'form' | 'details';

interface AgentsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('agentsPageConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.projectNumber; // Ensure project number isn't part of this state
      delete parsed.collectionId; // Remove deprecated keys
      delete parsed.assistantId;  // Remove deprecated keys
      return parsed;
    }
  } catch (e) {
    console.error("Failed to parse config from sessionStorage", e);
    sessionStorage.removeItem('agentsPageConfig');
  }
  return {
    appId: '',
    appLocation: 'global',
  };
};

const AgentsPage: React.FC<AgentsPageProps> = ({ projectNumber, setProjectNumber, accessToken }) => {
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
  const [config, setConfig] = useState(() => ({
    ...getInitialConfig(),
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  }));
  const [sortConfig, setSortConfig] = useState<{ key: SortableAgentKey; direction: SortDirection }>({ key: 'displayName', direction: 'asc' });

  // State for dropdown options and their loading status
  const [apps, setApps] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  // Save config to session storage on change
  useEffect(() => {
    // Only save the user-configurable parts
    const { appId, appLocation } = config;
    sessionStorage.setItem('agentsPageConfig', JSON.stringify({ appId, appLocation }));
  }, [config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
        const newConfig = { ...prev, [name]: value };
        // Reset children when parent changes
        if (name === 'appLocation') {
            newConfig.appId = '';
            setApps([]);
        }
        return newConfig;
    });
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

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

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
            // Auto-select if there is only one option
            if (fetchedApps.length === 1) {
                const singleAppId = fetchedApps[0].name.split('/').pop();
                if (singleAppId) {
                    setConfig(prev => ({ ...prev, appId: singleAppId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch apps/engines:", err);
            setError("Failed to fetch apps/engines.");
        } finally {
            setIsLoadingApps(false);
        }
    };
    fetchApps();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.collectionId]);

  const fetchAgents = useCallback(async () => {
    if (!apiConfig.projectId || !apiConfig.appId) {
      setAgents([]);
      if (apiConfig.projectId && !apiConfig.appId) {
        setError("Project and Gemini Enterprise must be selected to list agents.");
      }
      return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
        const assistantsResponse = await api.listResources('assistants', apiConfig);
        const assistants: Assistant[] = assistantsResponse.assistants || [];
        
        if (assistants.length === 0) {
            setAgents([]);
            console.log("No assistants found for this engine. Cannot list agents.");
            return;
        }

        const agentPromises = assistants.map(assistant => {
            const assistantId = assistant.name.split('/').pop()!;
            const agentListConfig = { ...apiConfig, assistantId };
            return api.listResources('agents', agentListConfig);
        });

        const agentResults = await Promise.allSettled(agentPromises);

        const allAgents: Agent[] = [];
        const failedAssistants: string[] = [];

        agentResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allAgents.push(...(result.value.agents || []));
            } else {
                const assistantName = assistants[index].displayName || assistants[index].name.split('/').pop()!;
                failedAssistants.push(assistantName);
                console.error(`Failed to fetch agents for assistant: ${assistantName}`, result.reason);
            }
        });
        
        // Enrich agents with their type from agentView
        const baseAgents = allAgents;
        if (baseAgents.length > 0) {
          const agentViewPromises = baseAgents.map(agent => 
            api.getAgentView(agent.name, apiConfig).catch(err => {
              console.warn(`Could not fetch agent view for ${agent.name}:`, err);
              return null;
            })
          );
          const agentViewResults = await Promise.all(agentViewPromises);

          const enrichedAgents = baseAgents.map((agent, index) => {
            const viewResult = agentViewResults[index];
            if (viewResult && viewResult.agentView) {
              return {
                ...agent,
                agentType: viewResult.agentView.agentType,
                agentOrigin: viewResult.agentView.agentOrigin,
              };
            }
            return agent;
          });
          setAgents(enrichedAgents);
        } else {
          setAgents(baseAgents);
        }
        
        if (failedAssistants.length > 0) {
            setError(`Could not fetch agents for some assistants: ${failedAssistants.join(', ')}. This may be expected for some engine types.`);
        }

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while fetching assistants or agents.');
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig]);

  useEffect(() => {
    if (config.appId) {
      fetchAgents();
    } else {
      setAgents([]); // Clear agents if app isn't selected
    }
  }, [fetchAgents, config.appId]);

  const handleToggleStatus = async (agent: Agent) => {
    const agentId = agent.name.split('/').pop() || '';
    setTogglingAgentId(agentId);
    setError(null);
    try {
      const isEnabled = agent.state?.toUpperCase() === 'ENABLED';
      // If enabled, disable. Otherwise (Disabled, Private, etc.), enable.
      const updatedAgent = isEnabled
        ? await api.disableAgent(agent.name, apiConfig)
        : await api.enableAgent(agent.name, apiConfig);

      // Preserve existing enriched properties (like agentType) when merging
      setAgents(prev => prev.map(a => a.name === updatedAgent.name ? { ...a, ...updatedAgent } : a));
      
      if (selectedAgent?.name === updatedAgent.name) {
          setSelectedAgent(prev => prev ? { ...prev, ...updatedAgent } : updatedAgent);
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
      // Handle potentially undefined properties
      const aVal = a[sortConfig.key] || '';
      const bVal = b[sortConfig.key] || '';
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [agents, sortConfig]);

  const renderContent = () => {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} />
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
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Gemini Enterprise ID</label>
            <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select Gemini Enterprise --'}</option>
              {apps.map(a => {
                  const appId = a.name.split('/').pop() || '';
                  return <option key={a.name} value={appId}>{a.displayName || appId}</option>
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
