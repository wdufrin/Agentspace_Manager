import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import AgentsPage from './pages/AgentsPage';
import AuthorizationsPage from './pages/AuthorizationsPage';
import { Page } from './types';
import AccessTokenInput from './components/AccessTokenInput';
import AgentEnginesPage from './pages/AgentEnginesPage';
import BackupPage from './pages/BackupPage';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.AGENTS);
  const [accessToken, setAccessToken] = useState<string>('');
  const [projectNumber, setProjectNumber] = useState<string>('');

  const renderPage = () => {
    switch (currentPage) {
      case Page.AGENTS:
        return <AgentsPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={setProjectNumber} />;
      case Page.AUTHORIZATIONS:
        return <AuthorizationsPage accessToken={accessToken} projectNumber={projectNumber} />;
      case Page.AGENT_ENGINES:
        return <AgentEnginesPage accessToken={accessToken} projectNumber={projectNumber} />;
      case Page.BACKUP_RECOVERY:
        return <BackupPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={setProjectNumber} />;
      default:
        return <AgentsPage accessToken={accessToken} projectNumber={projectNumber} setProjectNumber={setProjectNumber} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-gray-800 border-b border-gray-700 p-4 flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
          <h1 className="text-xl font-bold text-white text-center md:text-left">Agentspace Manager</h1>
          <AccessTokenInput accessToken={accessToken} setAccessToken={setAccessToken} />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  );
};

export default App;