import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Authorization, Config, Agent } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AuthList from '../components/authorizations/AuthList';
import AuthForm from '../components/authorizations/AuthForm';
import ViewAuthModal from '../components/authorizations/ViewAuthModal';
import WorkforcePoolValidator from '../components/tools/WorkforcePoolValidator';
import ConfirmationModal from '../components/ConfirmationModal';

interface AuthorizationsPageProps {
  projectNumber: string;
}

const AuthorizationsPage: React.FC<AuthorizationsPageProps> = ({ projectNumber }) => {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [authToEdit, setAuthToEdit] = useState<Authorization | null>(null);
  const [authToView, setAuthToView] = useState<Authorization | null>(null);
  const [region, setRegion] = useState<string>('global');
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [authToDelete, setAuthToDelete] = useState<Authorization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for agent usage mapping
  const [authUsage, setAuthUsage] = useState<Record<string, Agent[]>>({});
  const [isScanningAgents, setIsScanningAgents] = useState(false);
  const [showWorkforceValidator, setShowWorkforceValidator] = useState(false);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      // These are not used for authorizations but are required by the type
    appLocation: region, 
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant'
  }), [projectNumber, region]);

  const fetchData = useCallback(async () => {
    if (!projectNumber) {
        setAuthorizations([]);
        setError("Project ID/Number is required to list authorizations.");
        return;
    }
    setIsLoading(true);
    setIsScanningAgents(true);
    setError(null);
    setAuthUsage({});

    try {
      const authPromise = api.listAuthorizations(apiConfig);
      
      const agentPromise = (async () => {
          const agentsList: Agent[] = [];
          const discoveryLocations = ['global', 'us', 'eu'];
          for (const discoveryLocation of discoveryLocations) {
              const locationConfig = { ...apiConfig, appLocation: discoveryLocation };
              try {
                  const collectionsResponse = await api.listResources('collections', locationConfig);
                  const collections = collectionsResponse.collections || [];
                  for (const collection of collections) {
                      const collectionId = collection.name.split('/').pop()!;
                      const collectionConfig = { ...locationConfig, collectionId };
                      try {
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
                      } catch (e) { /* ignore errors in sub-resources to allow partial data */ }
                  }
              } catch (e) { /* ignore errors in sub-resources to allow partial data */ }
          }
          return agentsList;
      })();

      const [authResponse, allAgents] = await Promise.all([authPromise, agentPromise]);
      
      // Strict filtering: Ensure we only show authorizations that match the selected region
      // This handles cases where the API might return mixed results or if there's any confusion
      const regionPattern = `/locations/${apiConfig.appLocation}/`;
      const filteredAuths = (authResponse.authorizations || []).filter(auth => auth.name.includes(regionPattern));

      setAuthorizations(filteredAuths);
      
      const usageMap: Record<string, Agent[]> = {};
      for (const agent of allAgents) {
        const usedAuths = new Set<string>();
          if (agent.authorizations) {
          agent.authorizations.forEach(a => usedAuths.add(a));
        }
        if (agent.authorizationConfig?.toolAuthorizations) {
          agent.authorizationConfig.toolAuthorizations.forEach(a => usedAuths.add(a));
        }

        for (const authName of usedAuths) {
          if (!usageMap[authName]) {
            usageMap[authName] = [];
          }
          usageMap[authName].push(agent);
          }
      }
      setAuthUsage(usageMap);

    } catch (err: any) {
      setError(err.message || 'Failed to fetch authorizations or agent data.');
      setAuthorizations([]);
    } finally {
      setIsLoading(false);
      setIsScanningAgents(false);
    }
  }, [projectNumber, apiConfig]);

  useEffect(() => {
    if (projectNumber) {
        fetchData();
    } else {
        setAuthorizations([]); // Clear if no project number is set
        setAuthUsage({});
    }
  }, [fetchData, projectNumber]);
  
  const requestDelete = (auth: Authorization) => {
    setAuthToDelete(auth);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!authToDelete) return;
    
    const authId = authToDelete.name.split('/').pop() || '';
    setIsDeleting(true);
    setIsDeleteModalOpen(false);
    setError(null);

    try {
        await api.deleteAuthorization(authId, apiConfig);
        fetchData(); // Refresh list and usage map
    } catch (err: any) {
        let errorMessage = err.message || `Failed to delete authorization ${authId}.`;

        if (errorMessage.includes("is used by another agent") || errorMessage.includes("is linked to a resource")) {
            const agentNameMatch = errorMessage.match(/(projects\/[^\s]+)/);
            if (agentNameMatch && agentNameMatch[0] && agentNameMatch[0].includes('/agents/')) {
                const agentResourceName = agentNameMatch[0];
                const agentId = agentResourceName.split('/').pop() || agentResourceName;
                
                errorMessage = `Cannot delete. Authorization is in use by agent with ID: ${agentId}. Please remove the dependency before deleting.`;

                try {
                    const agentParts = agentResourceName.split('/');
                    if (agentParts.length > 3) {
                        const agentLocation = agentParts[3];
                        const agentConfig = { ...apiConfig, appLocation: agentLocation };
                        const agentDetails = await api.getAgent(agentResourceName, agentConfig);
                        errorMessage = `Cannot delete. Authorization is in use by agent: "${agentDetails.displayName}" (ID: ${agentId}). Please remove the dependency before deleting.`;
                    }
                } catch (agentFetchError: any) {
                    console.error("Failed to fetch details for blocking agent:", agentFetchError.message);
                    const lowerCaseMessage = agentFetchError.message ? agentFetchError.message.toLowerCase() : '';
                    if (lowerCaseMessage.includes('not found')) {
                        errorMessage = `Cannot delete. Authorization is in use by an agent (ID: ${agentId}) that appears to be recently deleted. Due to backend processing delays, this link can persist for some time. Please try again later (e.g., in an hour). To prevent this, edit agents to remove authorizations before deleting them in the future.`;
                    } else if (lowerCaseMessage.includes('does not exist')) {
                        errorMessage = `Cannot delete. Authorization is in use by an agent (ID: ${agentId}) whose parent App/Engine no longer exists. This can happen if the App/Engine was recently deleted. Due to backend processing delays, this link can persist for some time. Please try again later (e.g., in an hour).`;
                    }
                }
            } else {
                 errorMessage = "Cannot delete. This authorization is currently in use by another resource (e.g., an agent). Please remove the dependency before deleting.";
            }
        }
        setError(errorMessage);
    } finally {
        setIsDeleting(false);
        setAuthToDelete(null);
    }
  };

  const handleEdit = async (authId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Find the full auth object from the list to get the correct name (including location)
      const auth = authorizations.find(a => a.name.endsWith(`/${authId}`));
      if (!auth) {
        throw new Error(`Authorization with ID ${authId} not found in the current list.`);
      }

      // Use the full resource name which includes the correct location
      const authData = await api.getAuthorization(auth.name, apiConfig);
        setAuthToEdit(authData);
        setView('form');
    } catch (err: any) {
        setError(err.message || `Failed to fetch authorization ${authId} for editing.`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleView = async (auth: Authorization) => {
    // We already have the auth object from the list, but it might be partial if we optimized the list call later.
    // For now, the list returns full objects, but let's fetch fresh details to be safe and consistent with Edit.
    setIsLoading(true);
    setError(null);
    try {
      const authData = await api.getAuthorization(auth.name, apiConfig);
      setAuthToView(authData);
    } catch (err: any) {
      setError(err.message || `Failed to fetch details for authorization.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowCreateForm = () => {
    setAuthToEdit(null);
    setView('form');
  };

  const handleCancelForm = () => {
    setAuthToEdit(null);
    setView('list');
    setError(null);
  };

  const handleSuccess = () => {
    setView('list');
    setAuthToEdit(null);
    fetchData();
  };

  const renderContent = () => {
    if (isLoading && authorizations.length === 0) { return <Spinner />; }
    if (error && view === 'list') { return <div className="text-center text-red-400 mt-8">{error}</div>; }
    
    if (view === 'form') {
      return <AuthForm
        config={apiConfig}
        onSuccess={handleSuccess}
        onCancel={handleCancelForm}
        authToEdit={authToEdit}
      />;
    }

    return (
      <AuthList
        authorizations={authorizations}
        onDelete={requestDelete}
        onEdit={handleEdit}
        onView={handleView}
        onCreateNew={handleShowCreateForm}
        authUsage={authUsage}
        isScanningAgents={isScanningAgents}
      />
    );
  };

  return (
    <div>
      <div className="bg-gray-800 p-4 rounded-lg mb-6 shadow-md">
            <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                    {projectNumber || <span className="text-gray-500 italic">Not set (configure on Agents page)</span>}
                </div>
            </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-400 mb-1">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="global">Global</option>
            <option value="us">US (Multi-region)</option>
            <option value="eu">EU (Multi-region)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Select the region where you want to manage authorizations.
          </p>
        </div>

            {view === 'list' && (
                <button 
                    onClick={fetchData} 
                    disabled={isLoading}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? 'Loading...' : 'Refresh Authorizations'}
                </button>
            )}
      </div>

      {/* Tools Section */}
      {view === 'list' && (
        <div className="mb-6">
          <button
            onClick={() => setShowWorkforceValidator(!showWorkforceValidator)}
            className="text-sm text-blue-400 hover:text-blue-300 underline focus:outline-none"
          >
            {showWorkforceValidator ? 'Hide Tools' : 'Show Advanced Tools (Workforce Pool Validator)'}
          </button>

          {showWorkforceValidator && (
            <div className="mt-4 animate-fade-in-down">
              <WorkforcePoolValidator config={apiConfig} />
            </div>
          )}
        </div>
      )}
      {renderContent()}

      {authToDelete && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDelete}
            title="Confirm Authorization Deletion"
            confirmText="Delete"
            isConfirming={isDeleting}
        >
            <p>Are you sure you want to permanently delete this authorization?</p>
            <div className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600">
                <p className="font-bold text-white font-mono">{authToDelete.name.split('/').pop()}</p>
                 <p className="text-xs text-gray-400 mt-1">Client ID: {authToDelete.serverSideOauth2.clientId}</p>
            </div>
            <p className="mt-4 text-sm text-yellow-300">This action cannot be undone and may break agents that rely on it.</p>
        </ConfirmationModal>
      )}

      {authToView && (
        <ViewAuthModal
          isOpen={!!authToView}
          onClose={() => setAuthToView(null)}
          authorization={authToView}
        />
      )}
    </div>
  );
};

export default AuthorizationsPage;