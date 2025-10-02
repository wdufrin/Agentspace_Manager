import React, { useState, useCallback } from 'react';
import { ReasoningEngine, Config } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';

interface AgentEnginesPageProps {
  accessToken: string;
  projectNumber: string;
}

const AgentEnginesPage: React.FC<AgentEnginesPageProps> = ({ accessToken, projectNumber }) => {
  const [engines, setEngines] = useState<ReasoningEngine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState('us-central1');
  const [deletingEngineId, setDeletingEngineId] = useState<string | null>(null);

  const apiConfig: Config = {
      accessToken,
      projectId: projectNumber,
      reasoningEngineLocation: location,
      // Dummy values for other required config properties
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant'
  };

  const fetchEngines = useCallback(async () => {
    if (!accessToken || !projectNumber || !location) {
      setEngines([]);
      setError("Access Token, Project ID/Number, and Location are required to list agent engines.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listReasoningEngines(apiConfig);
      setEngines(response.reasoningEngines || []);
       if (!response.reasoningEngines || response.reasoningEngines.length === 0) {
           setError(`No agent engines found in location "${location}".`);
       }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch agent engines.');
      setEngines([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, projectNumber, location]);

  const handleDeleteEngine = async (engine: ReasoningEngine) => {
      const engineId = engine.name.split('/').pop();
      if (!engineId) return;

      setDeletingEngineId(engineId);
      setError(null);
      try {
          await api.deleteReasoningEngine(engine.name, apiConfig);
          await fetchEngines(); // Refresh the list
      } catch (err: any) {
          let errorMessage = err.message || `Failed to delete engine.`;
          if (errorMessage.includes("is in use by")) { // A common pattern for dependency errors
              errorMessage = `Cannot delete engine "${engine.displayName}". It may be in use by an agent. Please check agent configurations before deleting.`;
          }
          setError(errorMessage);
      } finally {
          setDeletingEngineId(null);
      }
  };

  const renderContent = () => {
    if (!accessToken) {
      return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token to begin.</div>;
    }
    if (isLoading) { return <Spinner />; }
    
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Full Resource Name</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
                            {engines.map((engine) => {
                                const engineId = engine.name.split('/').pop() || '';
                                const isDeleting = deletingEngineId === engineId;
                                return (
                                    <tr key={engine.name} className="hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{engine.displayName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{engineId}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{engine.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {isDeleting ? (
                                                <span className="text-xs text-gray-400 italic">Deleting...</span>
                                            ) : (
                                                <button 
                                                    onClick={() => handleDeleteEngine(engine)} 
                                                    disabled={isDeleting}
                                                    className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500"
                                                >
                                                    Delete
                                                </button>
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
                <option value="global">global</option>
                <option value="us">us</option>
                <option value="eu">eu</option>
            </select>
          </div>
        </div>
        <button
          onClick={fetchEngines}
          disabled={isLoading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
        >
          {isLoading ? 'Loading...' : 'Fetch Engines'}
        </button>
      </div>
      {renderContent()}
    </div>
  );
};

export default AgentEnginesPage;