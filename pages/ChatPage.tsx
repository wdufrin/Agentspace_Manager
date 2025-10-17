import React, { useState, useEffect, useMemo } from 'react';
import { Agent, Config } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import ChatWindow from '../components/agents/ChatWindow';

interface ChatPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('chatPageConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.collectionId;
      delete parsed.assistantId;
      return parsed;
    }
  } catch (e) { console.error("Failed to parse config from sessionStorage", e); }
  return {
    appLocation: 'global',
    appId: '',
    agentName: '',
  };
};

const ChatPage: React.FC<ChatPageProps> = ({ accessToken, projectNumber, setProjectNumber }) => {
  const [config, setConfig] = useState(() => ({
    ...getInitialConfig(),
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  }));
  const [error, setError] = useState<string | null>(null);

  const [apps, setApps] = useState<any[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  useEffect(() => {
    const { appLocation, appId, agentName } = config;
    sessionStorage.setItem('chatPageConfig', JSON.stringify({ appLocation, appId, agentName }));
  }, [config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
        const newConfig = { ...prev, [name]: value };
        if (name === 'appLocation') { newConfig.appId = ''; newConfig.agentName = ''; }
        if (name === 'appId') { newConfig.agentName = ''; }
        return newConfig;
    });
  };

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  const selectedAgent = useMemo(() => agents.find(a => a.name === config.agentName), [agents, config.agentName]);

  // --- Dropdown Data Fetching Effects ---
  useEffect(() => {
    if (!apiConfig.projectId || !apiConfig.appLocation) { setApps([]); return; }
    const fetch = async () => {
        setIsLoadingApps(true); setApps([]);
        try {
            const res = await api.listResources('engines', apiConfig);
            setApps(res.engines || []);
        } catch (err: any) { setError(err.message); }
        finally { setIsLoadingApps(false); }
    };
    fetch();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.collectionId]);

  useEffect(() => {
    if (!config.appId) { setAgents([]); return; }
    const fetch = async () => {
        setIsLoadingAgents(true); setAgents([]);
        try {
            const res = await api.listResources('agents', apiConfig);
            setAgents(res.agents || []);
        } catch (err: any) { setError(err.message); }
        finally { setIsLoadingAgents(false); }
    };
    fetch();
  }, [config.appId, apiConfig]);


  const renderContent = () => {
    if (!accessToken) {
      return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token to begin.</div>;
    }
    if (selectedAgent) {
        return <ChatWindow agent={selectedAgent} config={apiConfig} accessToken={accessToken} onClose={() => setConfig(prev => ({...prev, agentName: ''}))} />;
    }
    return (
        <div className="text-center text-gray-400 mt-8 bg-gray-800 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-white">Select an Agent</h3>
            <p>Please use the configuration dropdowns above to select an agent to chat with.</p>
        </div>
    );
  };
  
 return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Chat Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
            <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
              <option value="global">global</option><option value="us">us</option><option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">App / Engine</label>
            <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select App --'}</option>
              {apps.map(a => <option key={a.name} value={a.name.split('/').pop()!}>{a.displayName}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="agentName" className="block text-sm font-medium text-gray-400 mb-1">Agent</label>
            <select name="agentName" value={config.agentName} onChange={handleConfigChange} disabled={isLoadingAgents} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingAgents ? 'Loading...' : '-- Select Agent --'}</option>
              {agents.map(a => <option key={a.name} value={a.name}>{a.displayName}</option>)}
            </select>
          </div>
        </div>
      </div>
      {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
      <div className="flex-1 min-h-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default ChatPage;