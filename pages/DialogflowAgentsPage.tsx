
import React, { useState, useEffect, useMemo } from 'react';
import { DialogflowAgent, Config } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import DialogflowQueryModal from '../components/agent-engines/DialogflowQueryModal';
import ConfirmationModal from '../components/ConfirmationModal';

interface DialogflowAgentsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
}

const DialogflowAgentsPage: React.FC<DialogflowAgentsPageProps> = ({ projectNumber, setProjectNumber, accessToken }) => {
  const [agents, setAgents] = useState<DialogflowAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState('us-central1');
  
  // Modals state
  const [selectedAgentForTest, setSelectedAgentForTest] = useState<DialogflowAgent | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<DialogflowAgent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      reasoningEngineLocation: location, // reusing this field for DF location as api service expects it
      // Dummy values
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: ''
  }), [projectNumber, location]);

  const fetchAgents = async () => {
    if (!projectNumber) {
        setError("Project ID/Number is required.");
        return;
    }
    setIsLoading(true);
    setError(null);
    setAgents([]);
    try {
        const response = await api.listDialogflowAgents(apiConfig);
        setAgents(response.agents || []);
    } catch (err: any) {
        setError(err.message || 'Failed to fetch Dialogflow agents.');
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
      if (projectNumber) {
          fetchAgents();
      }
  }, [projectNumber, location]);

  const handleDelete = async () => {
      if (!agentToDelete) return;
      setIsDeleting(true);
      try {
          await api.deleteDialogflowAgent(agentToDelete.name, apiConfig);
          setAgents(prev => prev.filter(a => a.name !== agentToDelete.name));
          setAgentToDelete(null);
      } catch (err: any) {
          alert(`Failed to delete agent: ${err.message}`);
      } finally {
          setIsDeleting(false);
      }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Location</label>
            <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
            >
                <option value="us-central1">us-central1</option>
                <option value="us-east1">us-east1</option>
                <option value="us-west1">us-west1</option>
                <option value="global">global</option>
                <option value="europe-west1">europe-west1</option>
                <option value="asia-northeast1">asia-northeast1</option>
                <option value="australia-southeast1">australia-southeast1</option>
            </select>
          </div>
        </div>
        <button
            onClick={fetchAgents}
            disabled={isLoading || !projectNumber}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
        >
            {isLoading ? 'Loading...' : 'Refresh List'}
        </button>
      </div>

      {error && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg">{error}</div>}

      <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Dialogflow CX Agents</h2>
        </div>
        {isLoading ? (
            <div className="p-8"><Spinner /></div>
        ) : agents.length === 0 ? (
            <p className="text-gray-400 p-6 text-center">No agents found in this location.</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Time Zone</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Language</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {agents.map((agent) => (
                            <tr key={agent.name} className="hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-white">{agent.displayName}</div>
                                    <div className="text-xs text-gray-500 font-mono">{agent.name.split('/').pop()}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{agent.timeZone}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{agent.defaultLanguageCode}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                    <button
                                        onClick={() => setSelectedAgentForTest(agent)}
                                        className="text-green-400 hover:text-green-300"
                                    >
                                        Test Agent
                                    </button>
                                    <button
                                        onClick={() => setAgentToDelete(agent)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Test Modal */}
      {selectedAgentForTest && (
          <DialogflowQueryModal
              isOpen={!!selectedAgentForTest}
              onClose={() => setSelectedAgentForTest(null)}
              agent={selectedAgentForTest}
              config={apiConfig}
              accessToken={accessToken}
          />
      )}

      {/* Delete Confirmation */}
      {agentToDelete && (
          <ConfirmationModal
              isOpen={!!agentToDelete}
              onClose={() => setAgentToDelete(null)}
              onConfirm={handleDelete}
              title="Delete Agent"
              confirmText="Delete"
              isConfirming={isDeleting}
          >
              <p>Are you sure you want to delete <strong>{agentToDelete.displayName}</strong>?</p>
              <p className="text-xs text-gray-400 mt-2">This action cannot be undone.</p>
          </ConfirmationModal>
      )}
    </div>
  );
};

export default DialogflowAgentsPage;
