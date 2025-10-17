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
import ProjectInput from './components/ProjectInput';
import { initGapiClient, getGapiClient } from './services/gapiService';
import * as api from './services/apiService';
import ChatPage from './pages/ChatPage';


const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(Page.AGENTS);
  
  const [accessToken, setAccessToken] = useState<string>(() => sessionStorage.getItem('agentspace-accessToken') || '');
  const [projectNumber, setProjectNumber] = useState<string>(() => sessionStorage.getItem('agentspace-projectNumber') || '');

  // State for the initialization and login flow
  const [isGapiInitialized, setIsGapiInitialized] = useState(false);
  const [isGapiReady, setIsGapiReady] = useState(false); // New state for two-stage welcome screen
  const [isGapiLoading, setIsGapiLoading] = useState(false);
  const [isTokenValidating, setIsTokenValidating] = useState(false);
  const [gapiError, setGapiError] = useState<string | null>(null);

  // State for API validation check
  const [isApiValidationLoading, setIsApiValidationLoading] = useState(false);
  const [apiValidationResult, setApiValidationResult] = useState<{ enabled: string[], disabled: string[] } | null>(null);

  // State for enabling APIs
  const [apisToEnable, setApisToEnable] = useState<Set<string>>(new Set());
  const [isApiEnablingLoading, setIsApiEnablingLoading] = useState(false);
  const [apiEnablementLogs, setApiEnablementLogs] = useState<string[]>([]);


  const handleSetAccessToken = (token: string) => {
    const trimmedToken = token.trim();
    setAccessToken(trimmedToken); // Keep main state in sync
    sessionStorage.setItem('agentspace-accessToken', trimmedToken);
    
    if (trimmedToken) {
      setIsGapiLoading(true);
      setIsTokenValidating(false);
      setGapiError(null);
      setApiValidationResult(null);
      setApisToEnable(new Set());
      setApiEnablementLogs([]);
      
      initGapiClient(trimmedToken)
        .then(() => {
          console.log("Google API Client Initialized Successfully. Validating token...");
          setIsGapiLoading(false);
          setIsTokenValidating(true);
          // Perform a lightweight API call to validate the token's usability.
          return getGapiClient().then(client => client.cloudresourcemanager.projects.list({ pageSize: 1 }));
        })
        .then(() => {
          console.log("Token validated successfully.");
          setIsGapiReady(true);
          setGapiError(null);
        })
        .catch((err: any) => {
          console.error("GAPI initialization or token validation failed", err);
          let detailMessage = 'An unknown error occurred.';
          if (typeof err === 'string') {
              detailMessage = err;
          } else if (err instanceof Error) {
              detailMessage = err.message;
          } else if (err?.result?.error?.message) {
              detailMessage = err.result.error.message;
          } else {
              try {
                  detailMessage = JSON.stringify(err, null, 2);
              } catch {
                  detailMessage = 'A non-serializable error object was caught.';
              }
          }
          const errorMessage = `Failed to initialize or validate the token. Details: ${detailMessage}. The access token might be invalid, expired, or missing required scopes (e.g., cloud-platform).`;
          setGapiError(errorMessage);
          setIsGapiReady(false);
        })
        .finally(() => {
          setIsGapiLoading(false);
          setIsTokenValidating(false);
        });
    } else {
        setIsGapiReady(false);
        setIsGapiInitialized(false);
    }
  };
  
  const handleSetProjectNumber = (projectNum: string) => {
    sessionStorage.setItem('agentspace-projectNumber', projectNum);
    setProjectNumber(projectNum);
    // Also reset any results that depend on the project number
    setApiValidationResult(null);
  };
  
  const handleValidateApis = async () => {
    if (!projectNumber) return;
    setIsApiValidationLoading(true);
    setApiValidationResult(null);
    setApisToEnable(new Set());
    setApiEnablementLogs([]);
    setGapiError(null);
    try {
      const result = await api.validateEnabledApis(projectNumber);
      setApiValidationResult(result);
    } catch (err: any) {
      setGapiError(`API validation failed: ${err.message}. Please ensure the Service Usage API is enabled.`);
    } finally {
      setIsApiValidationLoading(false);
    }
  };

  const handleToggleApiToEnable = (apiName: string) => {
    setApisToEnable(prev => {
        const newSet = new Set(prev);
        if (newSet.has(apiName)) {
            newSet.delete(apiName);
        } else {
            newSet.add(apiName);
        }
        return newSet;
    });
  };

  const handleToggleAllApisToEnable = () => {
    if (apiValidationResult?.disabled) {
        if (apisToEnable.size === apiValidationResult.disabled.length) {
            setApisToEnable(new Set()); // Deselect all
        } else {
            setApisToEnable(new Set(apiValidationResult.disabled)); // Select all
        }
    }
  };

  const addEnablementLog = (log: string) => {
    setApiEnablementLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
  };

  const handleEnableApis = async () => {
    if (apisToEnable.size === 0) return;
    
    setIsApiEnablingLoading(true);
    setApiEnablementLogs([]);
    setGapiError(null);
    
    addEnablementLog(`Starting to enable ${apisToEnable.size} API(s)...`);
    try {
        const operation = await api.batchEnableApis(projectNumber, Array.from(apisToEnable));
        addEnablementLog(`Enablement operation started: ${operation.name}`);
        
        let currentOperation = operation;
        while (!currentOperation.done) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            currentOperation = await api.getServiceUsageOperation(operation.name);
            addEnablementLog('Polling for operation status...');
        }
        
        if (currentOperation.error) {
            throw new Error(`Operation failed: ${currentOperation.error.message}`);
        }
        
        addEnablementLog('API enablement successful! Re-validating...');
        setApisToEnable(new Set());
        await handleValidateApis();

    } catch (err: any) {
        const message = `API enablement failed: ${err.message}`;
        setGapiError(message);
        addEnablementLog(`ERROR: ${message}`);
    } finally {
        setIsApiEnablingLoading(false);
    }
  };

  const handleEnterApp = () => {
    if (isGapiReady && projectNumber) {
        setIsGapiInitialized(true);
    } else {
        setGapiError("Cannot enter application. Ensure the API client is initialized and a project is set.");
    }
  };


  // On initial component mount, check for an existing token and try to initialize.
  useEffect(() => {
    const existingToken = sessionStorage.getItem('agentspace-accessToken');
    if (existingToken) {
        handleSetAccessToken(existingToken);
    }
  }, []);

  const renderPage = () => {
    const commonProps = { projectNumber };
    const projectProps = { ...commonProps, setProjectNumber: handleSetProjectNumber };

    switch (currentPage) {
      case Page.AGENTS:
        return <AgentsPage {...projectProps} accessToken={accessToken} />;
      case Page.AUTHORIZATIONS:
        return <AuthorizationsPage {...commonProps} />;
      case Page.AGENT_ENGINES:
        return <AgentEnginesPage {...commonProps} accessToken={accessToken} />;
      case Page.AGENT_BUILDER:
        return <AgentBuilderPage {...commonProps} />;
      case Page.CHAT:
        return <ChatPage {...projectProps} accessToken={accessToken} />;
      case Page.DATA_STORES:
        return <DataStoresPage {...commonProps} />;
      case Page.MCP_SERVERS:
        return <McpServersPage {...commonProps} />;
      case Page.MODEL_ARMOR:
        return <ModelArmorPage {...projectProps} />;
      case Page.BACKUP_RECOVERY:
        return <BackupPage {...projectProps} accessToken={accessToken} />;
      default:
        return <AgentsPage {...projectProps} accessToken={accessToken} />;
    }
  };

  const renderApiValidationResults = () => {
    if (!apiValidationResult) return null;
    
    const renderList = (items: string[], isSuccess: boolean) => (
      <ul className="space-y-1">
        {items.map(item => {
          const serviceUrl = `https://console.cloud.google.com/apis/library/${item}?project=${projectNumber}`;
          return (
            <li key={item} className={`flex items-center text-sm ${isSuccess ? 'text-green-300' : 'text-red-300'}`}>
              {!isSuccess && (
                  <input
                      type="checkbox"
                      checked={apisToEnable.has(item)}
                      onChange={() => handleToggleApiToEnable(item)}
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 mr-3 shrink-0"
                      disabled={isApiEnablingLoading}
                  />
              )}
              {isSuccess ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
              )}
              <span>{item}</span>
              {!isSuccess && <a href={serviceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-blue-400 hover:underline">[View in Console]</a>}
            </li>
          );
        })}
      </ul>
    );

    return (
        <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="text-md font-semibold text-white mb-3">API Validation Results</h3>
            {apiValidationResult.disabled.length > 0 && (
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <h4 className="font-bold text-red-400">Disabled APIs ({apiValidationResult.disabled.length})</h4>
                            <p className="text-xs text-red-300">These APIs must be enabled for the app to function correctly.</p>
                        </div>
                        <label className="flex items-center text-xs text-gray-300 cursor-pointer">
                            <input
                                type="checkbox"
                                onChange={handleToggleAllApisToEnable}
                                checked={apiValidationResult.disabled.length > 0 && apisToEnable.size === apiValidationResult.disabled.length}
                                disabled={isApiEnablingLoading}
                                className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 mr-2"
                            />
                            Select All
                        </label>
                    </div>
                    {renderList(apiValidationResult.disabled, false)}
                </div>
            )}
            {apiValidationResult.enabled.length > 0 && (
                 <div>
                    <h4 className="font-bold text-green-400">Enabled APIs ({apiValidationResult.enabled.length})</h4>
                    {renderList(apiValidationResult.enabled, true)}
                </div>
            )}
            {apiValidationResult.disabled.length > 0 && (
                 <div className="mt-4 pt-4 border-t border-gray-700">
                    <button
                        onClick={handleEnableApis}
                        disabled={apisToEnable.size === 0 || isApiEnablingLoading}
                        className="w-full px-4 py-2.5 bg-yellow-600 text-white text-sm font-semibold rounded-md hover:bg-yellow-700 disabled:bg-gray-600 flex items-center justify-center"
                    >
                        {isApiEnablingLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                Enabling...
                            </>
                        ) : `Enable ${apisToEnable.size} Selected API(s)`}
                    </button>
                 </div>
            )}
        </div>
    );
  };


  if (!isGapiInitialized) {
    return (
        <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-100 font-sans p-4">
            <div className="w-full max-w-2xl p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
                <div className="text-center">
                    <div className="flex justify-center mb-4 text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-white">Welcome to Agentspace Manager</h1>
                </div>

                {!isGapiReady ? (
                    <>
                        <p className="text-center text-gray-400">Step 1: Provide a GCP Access Token to initialize the API client.</p>
                        <AccessTokenInput accessToken={accessToken} setAccessToken={handleSetAccessToken} />
                        {isGapiLoading && (
                             <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                                Initializing Google API Client... Please wait.
                            </div>
                        )}
                        {isTokenValidating && (
                             <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                                Validating access token permissions...
                            </div>
                        )}
                        {gapiError && <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg">{gapiError}</div>}
                    </>
                ) : (
                     <>
                        <div className="p-4 text-center text-green-300 bg-green-900/30 rounded-lg border border-green-700">
                           API Client Initialized & Token Validated Successfully!
                        </div>
                        <p className="text-center text-gray-400">Step 2: Set your Project and validate required APIs.</p>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                            <ProjectInput value={projectNumber} onChange={handleSetProjectNumber} />
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={handleValidateApis}
                                disabled={!projectNumber || isApiValidationLoading || isApiEnablingLoading}
                                className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 flex items-center justify-center"
                            >
                                {isApiValidationLoading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                        Validating...
                                    </>
                                ) : 'Validate Required APIs'}
                            </button>
                             <button
                                onClick={handleEnterApp}
                                disabled={!projectNumber || isApiEnablingLoading}
                                className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600"
                            >
                                Enter Application
                            </button>
                        </div>
                        {gapiError && <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg">{gapiError}</div>}
                        {renderApiValidationResults()}
                        {(isApiEnablingLoading || apiEnablementLogs.length > 0) && (
                            <div className="mt-4">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">API Enablement Log</h4>
                                <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-32 overflow-y-auto font-mono">
                                    {apiEnablementLogs.join('\n')}
                                </pre>
                            </div>
                        )}
                    </>
                )}
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