
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Agent, AppEngine, Assistant, Config } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import AssistantDetailsForm from '../components/assistants/AssistantDetailsForm';
import AgentListForAssistant from '../components/assistants/AgentListForAssistant';
import ExportMetricsModal from '../components/assistants/ExportMetricsModal';
import AnalyticsMetricsViewer from '../components/assistants/AnalyticsMetricsViewer';

interface AssistantPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('assistantPageConfig');
    if (savedConfig) return JSON.parse(savedConfig);
  } catch (e) { console.error("Failed to parse config", e); }
  return { appLocation: 'global', appId: '' };
};

const AssistantPage: React.FC<AssistantPageProps> = ({ projectNumber, setProjectNumber }) => {
  const [config, setConfig] = useState(getInitialConfig);
  const [apps, setApps] = useState<AppEngine[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem('assistantPageConfig', JSON.stringify(config));
  }, [config]);

  const apiConfig: Config = useMemo(() => ({
    projectId: projectNumber,
    appLocation: config.appLocation,
    collectionId: 'default_collection',
    appId: config.appId,
    assistantId: 'default_assistant'
  }), [projectNumber, config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
      const newConfig = { ...prev, [name]: value };
      if (name === 'appLocation') {
        newConfig.appId = '';
        setApps([]);
      }
      return newConfig;
    });
    setAssistant(null);
    setAgents([]);
    setError(null);
  };

  // Fetch Engines/Apps
  useEffect(() => {
    if (!projectNumber || !config.appLocation) {
      setApps([]);
      return;
    }
    const fetchApps = async () => {
      setIsLoadingApps(true);
      setApps([]);
      try {
        const res = await api.listResources('engines', { ...apiConfig, appId: '', assistantId: '' });
        const fetchedApps = res.engines || [];
        setApps(fetchedApps);
        if (fetchedApps.length === 1) {
            setConfig(prev => ({ ...prev, appId: fetchedApps[0].name.split('/').pop()! }));
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoadingApps(false);
      }
    };
    fetchApps();
  }, [projectNumber, config.appLocation]);

  // Fetch Assistant and Agents
  const fetchData = useCallback(async () => {
    if (!apiConfig.appId) {
        setAssistant(null);
        setAgents([]);
        setError("Please select a Gemini Enterprise ID to view the assistant.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const assistantName = `projects/${apiConfig.projectId}/locations/${apiConfig.appLocation}/collections/${apiConfig.collectionId}/engines/${apiConfig.appId}/assistants/default_assistant`;
      const [assistantDetails, agentsResponse] = await Promise.all([
        api.getAssistant(assistantName, apiConfig),
        api.listResources('agents', apiConfig)
      ]);
      setAssistant(assistantDetails);
      
      const baseAgents = agentsResponse.agents || [];
      if (baseAgents.length > 0) {
        // Step 2: Fetch agent views to get agentType
        const agentViewPromises = baseAgents.map(agent => api.getAgentView(agent.name, apiConfig));
        const agentViewResults = await Promise.allSettled(agentViewPromises);

        const enrichedAgents = baseAgents.map((agent, index) => {
          const viewResult = agentViewResults[index];
          if (viewResult.status === 'fulfilled' && viewResult.value.agentView) {
            return {
              ...agent,
              agentType: viewResult.value.agentView.agentType,
              agentOrigin: viewResult.value.agentView.agentOrigin,
            };
          } else {
            if (viewResult.status === 'rejected') {
                console.warn(`Could not fetch agent view for ${agent.name}:`, viewResult.reason);
            }
            return agent; // Return original agent if view fetch fails or agentView is missing
          }
        });
        setAgents(enrichedAgents);
      } else {
        setAgents([]);
      }

    } catch (err: any) {
      setError(err.message || "Failed to fetch assistant details or agents.");
      setAssistant(null);
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig]);
  
  const handleUpdateSuccess = (updatedAssistant: Assistant) => {
    setAssistant(updatedAssistant);
  };

  return (
    <div className="space-y-6">
      <ExportMetricsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        config={apiConfig}
      />
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Assistant Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
            <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Gemini Enterprise ID</label>
            <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select an Engine --'}</option>
              {apps.map(a => {
                  const appId = a.name.split('/').pop() || '';
                  return <option key={a.name} value={appId}>{a.displayName || appId}</option>
              })}
            </select>
          </div>
        </div>
        <div className="flex gap-4 mt-4">
            <button 
                onClick={fetchData} 
                disabled={isLoading || !config.appId}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
            >
                {isLoading ? 'Loading...' : 'Load Assistant & Agents'}
            </button>
            <button
                onClick={() => setIsExportModalOpen(true)}
                disabled={!config.appId}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-500"
            >
                Backup Metrics
            </button>
        </div>
      </div>

      {error && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg">{error}</div>}
      
      {isLoading && <Spinner />}

      {!isLoading && assistant && (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AssistantDetailsForm 
                    assistant={assistant}
                    config={apiConfig}
                    onUpdateSuccess={handleUpdateSuccess}
                />
                <AgentListForAssistant agents={agents} />
            </div>
            <AnalyticsMetricsViewer config={apiConfig} />
        </>
      )}
    </div>
  );
};

export default AssistantPage;
