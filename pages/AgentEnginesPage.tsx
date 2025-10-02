

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
  
  // State for delete confirmation
  const [deletingEngineId, setDeletingEngineId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [engineToDelete, setEngineToDelete] = useState<ReasoningEngine | null>(null);

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

    try {
      // 1. Fetch reasoning engines from the selected GCP location (e.g., us-central1)
      const enginesResponse = await api.listReasoningEngines(apiConfig);
      const fetchedEngines = enginesResponse.reasoningEngines || [];
      setEngines(fetchedEngines);

      if (fetchedEngines.length === 0) {
          setError(`No agent engines found in location "${location}".`);
          setIsLoading(false);
          return;
      }

      // 2. Fetch ALL agents from ALL discovery engine locations ('global', 'us', 'eu') to build the cross-reference.
      // This is a more robust approach that explicitly queries each location.
      const agentsList: Agent[] = [];
      const discoveryLocations = ['global', 'us', 'eu'];

      for (const discoveryLocation of discoveryLocations) {
          console.log(`Searching for agents in Discovery Engine location: ${discoveryLocation}`);
          const locationConfig = { ...apiConfig, appLocation: discoveryLocation };
          
          const collectionsResponse = await api.listResources('collections', locationConfig);
          const collections = collectionsResponse.collections || [];

          for (const collection of collections) {
              const collectionId = collection.name.split('/').pop()!;
              const collectionConfig = { ...locationConfig, collectionId };
              
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
          }
      }
      setAllAgents(agentsList);

    } catch (err: any) {
        setError(err.message || 'Failed to fetch resources.');
        setEngines([]);
        setAllAgents([]);
    } finally {
        setIsLoading(false);
    }
  }, [apiConfig, location, accessToken, projectNumber]);

  const requestDeleteEngine = (engine: ReasoningEngine) => {
    setEngineToDelete(engine);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteEngine = async () => {
      if (!engineToDelete) return;
      
      const engineId = engineToDelete.name.split('/').pop();
      if (!engineId) return;

      setDeletingEngineId(engineId);
      setIsDeleteModalOpen(false);
      setError(null);

      try {
          await api.deleteReasoningEngine(engineToDelete.name, apiConfig);
          setViewMode('list'); // Go back to list after deletion
          await fetchEngines(); // Refresh the list
      } catch (err: any) {
          let errorMessage = err.message || `Failed to delete engine.`;
          if (errorMessage.includes("is in use by")) { // A common pattern for dependency errors
              errorMessage = `Cannot delete engine "${engineToDelete.displayName}". It may be in use by an agent. Please check agent configurations before deleting.`;
          }
          setError(errorMessage);
      } finally {
          setDeletingEngineId(null);
          setEngineToDelete(null);
      }
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
    
    return (
        <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">Agent Engines</h2>
            </div>
             {error && <div className="text-center text-red-400 p-4">{error}</div>}
            {engines.length === 0 && !isLoading && !error && (
                 <p className="text-gray-400 p-6 text-center">No agent engines loaded. Please provide a project and location, then click "Fetch Engines".</p>
            )}
            {engines.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Engine ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Used By Agents</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {engines.map((engine) => {
                                const engineId = engine.name.split('/').pop() || '';
                                const isDeleting = deletingEngineId === engineId;
                                const usingAgents = agentsByEngine[engine.name] || [];

                                return (
                                    <tr key={engine.name} className="hover:bg-gray-700/50 transition-colors">
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
                                            {isDeleting ? (
                                                <span className="text-xs text-gray-400 italic">Deleting...</span>
                                            ) : (
                                                <>
                                                    <button 
                                                        onClick={() => handleViewEngine(engine)} 
                                                        className="font-semibold text-blue-400 hover:text-blue-300"
                                                    >
                                                        View
                                                    </button>
                                                    <button 
                                                        onClick={() => requestDeleteEngine(engine)} 
                                                        disabled={isDeleting}
                                                        className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )}
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

      {engineToDelete && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDeleteEngine}
            title="Confirm Engine Deletion"
            confirmText="Delete"
            isConfirming={!!deletingEngineId}
        >
            <p>Are you sure you want to permanently delete this agent engine?</p>
             <div className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600">
                <p className="font-bold text-white">{engineToDelete.displayName}</p>
                <p className="text-xs font-mono text-gray-400 mt-1">{engineToDelete.name.split('/').pop()}</p>
            </div>
            <p className="mt-4 text-sm text-yellow-300">This action cannot be undone and may break agents that rely on it.</p>
        </ConfirmationModal>
      )}
    </div>
  );
};

export default AgentEnginesPage;