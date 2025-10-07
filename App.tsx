import React, { useState } from 'react';
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

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.AGENTS);
  
  // Load initial state from sessionStorage or default to empty strings
  const [accessToken, setAccessToken] = useState<string>(() => sessionStorage.getItem('agentspace-accessToken') || '');
  const [projectNumber, setProjectNumber] = useState<string>(() => sessionStorage.getItem('agentspace-projectNumber') || '');

  // Create handlers that update both state and sessionStorage
  const handleSetAccessToken = (token: string) => {
    sessionStorage.setItem('agentspace-accessToken', token);
    setAccessToken(token);
  };

  const handleSetProjectNumber = (projectNum: string) => {
    sessionStorage.setItem('agentspace-projectNumber', projectNum);
    setProjectNumber(projectNum);
  };

  const renderPage = () => {
    switch (currentPage) {
      case Page.AGENTS:
        return <AgentsPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={handleSetProjectNumber} />;
      case Page.AUTHORIZATIONS:
        return <AuthorizationsPage accessToken={accessToken} projectNumber={projectNumber} />;
      case Page.AGENT_ENGINES:
        return <AgentEnginesPage accessToken={accessToken} projectNumber={projectNumber} />;
      case Page.AGENT_BUILDER:
        return <AgentBuilderPage accessToken={accessToken} projectNumber={projectNumber} />;
      case Page.DATA_STORES:
        return <DataStoresPage accessToken={accessToken} projectNumber={projectNumber} />;
      case Page.MODEL_ARMOR:
        return <ModelArmorPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={handleSetProjectNumber} />;
      case Page.BACKUP_RECOVERY:
        return <BackupPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={handleSetProjectNumber} />;
      default:
        return <AgentsPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={handleSetProjectNumber} />;
    }
  };

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