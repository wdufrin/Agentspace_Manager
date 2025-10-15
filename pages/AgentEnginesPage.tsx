
import React, { useState, useCallback, useMemo } from 'react';
import { ReasoningEngine, Config, Agent } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import ConfirmationModal from '../components/ConfirmationModal';
import EngineDetails from '../components/agent-engines/EngineDetails';

interface AgentEnginesPageProps {
  accessToken: string;
  projectNumber: string;
}

const AgentEnginesPage: React.FC<AgentEnginesPageProps> = ({ accessToken, projectNumber }) => {
  const [engines, setEngines] = useState<ReasoningEngine[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState('us-central1');
  
  // State for view management
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
  const [selectedEngine, setSelectedEngine] = useState<ReasoningEngine | null>(null);
  
  // State for multi-select and delete confirmation
  const [selectedEngines, setSelectedEngines] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const apiConfig: Config = useMemo(() => ({
      accessToken,
      projectId: projectNumber,
      reasoningEngineLocation: location,
      // Dummy values for other required config properties
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant'
  }), [accessToken, projectNumber, location]);

  const agentsByEngine = useMemo(() => {
    if (!allAgents.length) return {};
    
    return allAgents.reduce((acc, agent) => {
        const engineName = agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
        if (engineName) {
            if (!acc[engineName]) {
                acc[engineName] = [];
            }
            acc[engineName].push(agent);
        }
        return acc;
    }, {} as { [key: string]: Agent[] });
  }, [allAgents]);

  const fetchEngines = useCallback(async () => {
    if (!accessToken || !projectNumber || !location) {
      setEngines([]);
      setError("Access Token, Project ID/Number, and Location are required to list agent engines.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setEngines([]);
    setAllAgents([]);
    setSelectedEngines(new Set()); // Clear selection on refresh

    try {
      // Step 1: Fetch the primary resource list (Reasoning Engines). This is critical.
      const enginesResponse = await api.listReasoningEngines(apiConfig);
      const fetchedEngines = enginesResponse.reasoningEngines || [];
      setEngines(fetchedEngines);

      if (fetchedEngines.length === 0) {
        // This is not an error, just an empty state.
        // setError(`No agent engines found in location "${location}".`);
        return; // The finally block will handle isLoading
      }

      // Step 2: Attempt to fetch agent usage data. This is non-critical and best-effort.
      try {
        const agentsList: Agent[] = [];
        const discoveryLocations = ['global', 'us', 'eu'];

        for (const discoveryLocation of discoveryLocations) {
          console.log(`Searching for agents in Discovery Engine location: ${discoveryLocation}`);
          const locationConfig = { ...apiConfig, appLocation: discoveryLocation };
          
          try {
            const collectionsResponse = await api.listResources('collections', locationConfig);
            const collections = collectionsResponse.collections || [];

            for (const collection of collections) {
              const collectionId = collection.name.split('/').pop()!;
              const collectionConfig = { ...locationConfig, collectionId };
              
              try {
                const appEnginesResponse = await api.listResources('engines', collectionConfig);
                const appEngines = appEnginesResponse.engines || [];

                for (const appEngine of appEngines) {
                  const appId = appEngine.name.split('/').pop()!;
                  const appConfig = { ...collectionConfig, appId };
                  
                  const assistantsResponse = await api.listResources('assistants', appConfig);
                  const assistants = assistantsResponse.assistants || [];

                  for (const assistant of assistants) {
                    const assistantId = assistant.name.split('/').pop()!;
                    const assistantConfig = { ...appConfig, assistantId };
                    
                    const agentsResponse = await api.listResources('agents', assistantConfig);
                    if (agentsResponse.agents) {
                      agentsList.push(...agentsResponse.agents);
                    }
                  }
                }
              } catch (enginesError: any) {
                console.warn(`Could not fetch app engines for collection '${collection.name}' in location '${discoveryLocation}': ${enginesError.message}`);
              }
            }
          } catch (collectionsError: any) {
              console.warn(`Could not fetch collections for location '${discoveryLocation}': ${collectionsError.message}`);
          }
        }
        setAllAgents(agentsList);
      } catch (agentFetchError: any) {
        console.error("A general error occurred while fetching agent usage data:", agentFetchError);
        setError("Successfully fetched agent engines, but failed to determine agent usage. The 'Used By Agents' column may be incomplete or empty.");
        setAllAgents([]); // Ensure it's empty on failure
      }

    } catch (enginesError: any) {
      // This is a fatal error for this page, as we can't get the primary list.
      setError(enginesError.message || 'Failed to fetch agent engines.');
      setEngines([]);
      setAllAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, location, accessToken, projectNumber]);
  
  const handleToggleSelect = (engineName: string) => {
    setSelectedEngines(prev => {
        const newSet = new Set(prev);
        if (newSet.has(engineName)) {
            newSet.delete(engineName);
        } else {
            newSet.add(engineName);
        }
        return newSet;
    });
  };

  const handleToggleSelectAll = () => {
      if (selectedEngines.size === engines.length) {
          setSelectedEngines(new Set());
      } else {
          setSelectedEngines(new Set(engines.map(e => e.name)));
      }
  };

  const openDeleteModal = (engine?: ReasoningEngine) => {
      // If a specific engine is provided (from a row button), select only that one.
      if (engine) {
          setSelectedEngines(new Set([engine.name]));
      }
      // Open the modal if there's a selection from either source.
      if (selectedEngines.size > 0 || engine) {
          setIsDeleteModalOpen(true);
      }
  };
  
  const confirmDelete = async () => {
    if (selectedEngines.size === 0) return;
    
    setIsDeleting(true);
    setError(null);
    
    const enginesToDelete = Array.from(selectedEngines);
    const results = await Promise.allSettled(
        enginesToDelete.map(engineName => api.deleteReasoningEngine(engineName, apiConfig))
    );

    const failures: string[] = [];
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const engineName = String(enginesToDelete[index]).split('/').pop();
            const reason = result.reason;
            // FIX: The rejection 'reason' from a Promise is of type 'unknown' and must be safely converted to a string before use.
            const message = reason instanceof Error ? reason.message : String(reason);
            failures.push(`- ${engineName}: ${message}`);
        }
    });

    if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} engine(s):\n${failures.join('\n')}`);
    }

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    await fetchEngines(); // Refresh list, which also clears selection
  };
  
  const handleViewEngine = (engine: ReasoningEngine) => {
    setSelectedEngine(engine);
    setViewMode('details');
  };

  const renderContent = () => {
    if (!accessToken) {
      return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token to begin.</div>;
    }
    if (isLoading && viewMode === 'list') { return <Spinner />; }
    
    if (viewMode === 'details' && selectedEngine) {
        return (
            <EngineDetails 
                engine={selectedEngine} 
                usingAgents={agentsByEngine[selectedEngine.name] || []}
                onBack={() => { setViewMode('list'); setSelectedEngine(null); }}
            />
        );
    }
    
    const isAllSelected = selectedEngines.size === engines.length && engines.length > 0;

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">Agent Engines</h2>
                 {selectedEngines.size > 0 && (
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-300">{selectedEngines.size} selected</span>
                        <button
                            onClick={() => openDeleteModal()}
                            disabled={isDeleting}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800"
                        >
                            Delete Selected
                        </button>
                    </div>
                )}
            </div>
             {error && <div className="p-4 bg-red-900/20 text-red-300 text-sm rounded-b-lg whitespace-pre-wrap">{error}</div>}
            {engines.length === 0 && !isLoading && !error && (
                 <p className="text-gray-400 p-6 text-center">No agent engines found in this location. Use the controls above to fetch them.</p>
            )}
            {engines.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={handleToggleSelectAll}
                                        aria-label="Select all engines"
                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                                    />
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Engine ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Used By Agents</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {engines.map((engine) => {
                                const engineId = engine.name.split('/').pop() || '';
                                const isSelected = selectedEngines.has(engine.name);
                                const usingAgents = agentsByEngine[engine.name] || [];

                                return (
                                    <tr key={engine.name} className={`${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} transition-colors`}>
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleSelect(engine.name)}
                                                aria-label={`Select engine ${engine.displayName}`}
                                                className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{engine.displayName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{engineId}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {usingAgents.length > 0 ? (
                                                <ul className="space-y-1">
                                                    {usingAgents.map(agent => {
                                                        const agentEngineId = agent.name.split('/')[7];
                                                        return (
                                                            <li key={agent.name} className="text-xs" title={agent.name}>
                                                                - {agentEngineId}/{agent.displayName}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : (
                                                <span className="text-xs text-gray-500 italic">Not in use</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                            <button 
                                                onClick={() => handleViewEngine(engine)} 
                                                className="font-semibold text-blue-400 hover:text-blue-300"
                                            >
                                                View
                                            </button>
                                            <button 
                                                onClick={() => openDeleteModal(engine)} 
                                                disabled={isDeleting}
                                                className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
  };

  return (
    <div>
      <div className="bg-gray-800 p-4 rounded-lg mb-6 shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                {projectNumber || <span className="text-gray-500 italic">Not set (configure on Agents page)</span>}
            </div>
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-400 mb-1">GCP Location</label>
            <select
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
            >
                <option value="us-central1">us-central1</option>
                <option value="us-east1">us-east1</option>
                <option value="us-east4">us-east4</option>
                <option value="us-west1">us-west1</option>
                <option value="europe-west1">europe-west1</option>
                <option value="europe-west2">europe-west2</option>
                <option value="europe-west4">europe-west4</option>
                <option value="asia-east1">asia-east1</option>
                <option value="asia-southeast1">asia-southeast1</option>
            </select>
          </div>
        </div>
        {viewMode === 'list' && (
            <button
                onClick={fetchEngines}
                disabled={isLoading}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
            >
            {isLoading ? 'Loading...' : 'Fetch Engines'}
            </button>
        )}
      </div>
      {renderContent()}

      {isDeleteModalOpen && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDelete}
            title={`Confirm Deletion of ${selectedEngines.size} Engine(s)`}
            confirmText="Delete"
            isConfirming={isDeleting}
        >
            <p>Are you sure you want to permanently delete the following agent engine(s)?</p>
            <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
                {Array.from(selectedEngines).map(engineName => {
                    const engine = engines.find(e => e.name === engineName);
                    return (
                        <li key={engineName} className="text-sm">
                            <p className="font-bold text-white">{engine?.displayName || 'Unknown Engine'}</p>
                            <p className="text-xs font-mono text-gray-400 mt-1">{String(engineName).split('/').pop()}</p>
                        </li>
                    )
                })}
            </ul>
            <p className="mt-4 text-sm text-yellow-300">This action cannot be undone and may break agents that rely on these engines.</p>
        </ConfirmationModal>
      )}
    </div>
  );
};

export default AgentEnginesPage;
