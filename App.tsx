import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import AgentsPage from './pages/AgentsPage';
import AuthorizationsPage from './pages/AuthorizationsPage';
import { Page } from './types';
import AccessTokenInput from './components/AccessTokenInput';
import AgentEnginesPage from './pages/AgentEnginesPage';
import DataStoresPage from './pages/DataStoresPage';
import BackupPage from './pages/BackupPage';
import ModelArmorPage from './pages/ModelArmorPage';
import AgentBuilderPage from './pages/AgentBuilderPage';
import McpServersPage from './pages/McpServersPage';
import { initGapiClient } from './services/gapiService';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.AGENTS);
  
  const [accessToken, setAccessToken] = useState<string>(() => sessionStorage.getItem('agentspace-accessToken') || '');
  const [projectNumber, setProjectNumber] = useState<string>(() => sessionStorage.getItem('agentspace-projectNumber') || '');

  const [isGapiInitialized, setIsGapiInitialized] = useState(false);
  const [isGapiLoading, setIsGapiLoading] = useState(false);
  const [gapiError, setGapiError] = useState<string | null>(null);

  const handleSetAccessToken = (token: string) => {
    const trimmedToken = token.trim();
    sessionStorage.setItem('agentspace-accessToken', trimmedToken);
    setAccessToken(trimmedToken);

    if (trimmedToken) {
      setIsGapiLoading(true);
      setGapiError(null);
      initGapiClient(trimmedToken)
        .then(() => {
          console.log("Google API Client Initialized Successfully.");
          setIsGapiInitialized(true);
          setGapiError(null); // Clear previous errors
        })
        .catch((err) => {
          console.error("GAPI initialization failed", err);
          setGapiError(`Failed to initialize Google API Client. The access token might be invalid, expired, or missing required scopes. Details: ${err.message || 'Unknown error'}`);
          setIsGapiInitialized(false);
        })
        .finally(() => {
          setIsGapiLoading(false);
        });
    } else {
        // If token is cleared, de-initialize the app
        setIsGapiInitialized(false);
    }
  };

  // On initial component mount, check for an existing token and try to initialize.
  useEffect(() => {
    const existingToken = sessionStorage.getItem('agentspace-accessToken');
    if (existingToken) {
        handleSetAccessToken(existingToken);
    }
  }, []);


  const handleSetProjectNumber = (projectNum: string) => {
    sessionStorage.setItem('agentspace-projectNumber', projectNum);
    setProjectNumber(projectNum);
  };

  const renderPage = () => {
    const commonProps = { projectNumber };
    const projectProps = { ...commonProps, setProjectNumber: handleSetProjectNumber };

    switch (currentPage) {
      case Page.AGENTS:
        return <AgentsPage {...projectProps} />;
      case Page.AUTHORIZATIONS:
        return <AuthorizationsPage {...commonProps} />;
      case Page.AGENT_ENGINES:
        return <AgentEnginesPage {...commonProps} />;
      case Page.AGENT_BUILDER:
        return <AgentBuilderPage {...commonProps} />;
      case Page.DATA_STORES:
        return <DataStoresPage {...commonProps} />;
      case Page.MCP_SERVERS:
        return <McpServersPage {...commonProps} />;
      case Page.MODEL_ARMOR:
        return <ModelArmorPage {...projectProps} />;
      case Page.BACKUP_RECOVERY:
        return <BackupPage {...projectProps} accessToken={accessToken} />;
      default:
        return <AgentsPage {...projectProps} />;
    }
  };

  const renderStatus = () => {
    if (isGapiLoading) {
        return (
            <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                Initializing Google API Client... Please wait.
            </div>
        );
    }
    if (gapiError) {
        return <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg">{gapiError}</div>;
    }
    return null;
  };

  if (!isGapiInitialized) {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-100 font-sans p-4">
            <div className="w-full max-w-lg p-8 space-y-8 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
                <div className="text-center">
                    <div className="flex justify-center mb-4 text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white">Welcome to Agentspace Manager</h1>
                    <p className="mt-2 text-gray-400">Please provide a GCP Access Token to initialize the application.</p>
                </div>
                <AccessTokenInput accessToken={accessToken} setAccessToken={handleSetAccessToken} />
                <div className="h-16 flex items-center justify-center">
                    {renderStatus()}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-gray-800 border-b border-gray-700 p-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
          <h1 className="text-xl font-bold text-white text-center md:text-left">Agentspace Manager</h1>
          <AccessTokenInput accessToken={accessToken} setAccessToken={handleSetAccessToken} />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
};

export default App;