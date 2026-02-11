
import React, { useState, useEffect, useMemo } from 'react';
import { Config, UserProfile } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import ChatWindow from '../components/agents/ChatWindow';

interface ChatPageProps {
  accessToken: string;
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: any;
  userProfile: UserProfile | null;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('chatPageConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.collectionId;
      delete parsed.assistantId;
      delete parsed.agentName;
      return parsed;
    }
  } catch (e) { console.error("Failed to parse config from sessionStorage", e); }
  return {
    appLocation: 'global',
    appId: '',
  };
};

const ChatPage: React.FC<ChatPageProps> = ({ accessToken, projectNumber, setProjectNumber, context, userProfile }) => {
  const [config, setConfig] = useState(() => ({
    ...getInitialConfig(),
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  }));
  const [error, setError] = useState<string | null>(null);

  const [apps, setApps] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  useEffect(() => {
    if (context?.appEngineId) {
      const resourceName = context.appEngineId;
      const location = resourceName.split('/')[3] || 'global';
      const engineId = resourceName.split('/').pop() || '';
      
      setConfig(prev => ({
        ...prev,
        appLocation: location,
        appId: engineId
      }));
    }
  }, [context]);

  useEffect(() => {
    const { appLocation, appId } = config;
    sessionStorage.setItem('chatPageConfig', JSON.stringify({ appLocation, appId }));
  }, [config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
        const newConfig = { ...prev, [name]: value };
        if (name === 'appLocation') { newConfig.appId = ''; }
        return newConfig;
    });
  };

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  const selectedApp = useMemo(() => apps.find(a => a.name.endsWith(`/${config.appId}`)), [apps, config.appId]);

  // Fetch Apps list
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

  const renderContent = () => {
    if (!accessToken) {
      return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token to begin.</div>;
    }
    if (selectedApp) {
        return (
            <div className="h-full">
                <ChatWindow 
                    targetDisplayName={selectedApp.displayName} 
                    config={apiConfig} 
                    accessToken={accessToken} 
                    onClose={() => setConfig(prev => ({...prev, appId: ''}))}
              userProfile={userProfile}
                />
            </div>
        );
    }
    return (
        <div className="text-center text-gray-400 mt-8 bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white">Select a Gemini Enterprise Engine</h3>
            <p className="mt-2">Please use the configuration dropdowns above to select an engine to chat with. Linked data stores will be included automatically.</p>
        </div>
    );
  };
  
 return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 shrink-0">
        <h2 className="text-lg font-semibold text-white mb-3">Test Agent Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Gemini Enterprise</label>
            <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select App --'}</option>
              {apps.map(a => <option key={a.name} value={a.name.split('/').pop()!}>{a.displayName}</option>)}
            </select>
          </div>
        </div>
      </div>
      {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg border border-red-800">{error}</div>}
      <div className="flex-1 min-h-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default ChatPage;
