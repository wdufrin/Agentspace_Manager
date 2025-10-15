import React, { useState, useEffect, useCallback } from 'react';
import { Authorization, Config } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AuthList from '../components/authorizations/AuthList';
import AuthForm from '../components/authorizations/AuthForm';
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
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [authToDelete, setAuthToDelete] = useState<Authorization | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const apiConfig: Omit<Config, 'accessToken'> = {
      projectId: projectNumber,
      // These are not used for authorizations but are required by the type
      appLocation: 'global', 
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant'
  };

  const fetchAuthorizations = useCallback(async () => {
    if (!projectNumber) {
        setAuthorizations([]);
        setError("Project ID/Number is required to list authorizations.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listAuthorizations(apiConfig);
      setAuthorizations(response.authorizations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch authorizations.');
      setAuthorizations([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectNumber]);

  useEffect(() => {
    if (projectNumber) {
        fetchAuthorizations();
    } else {
        setAuthorizations([]); // Clear if no project number is set
    }
  }, [fetchAuthorizations, projectNumber]);
  
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
        fetchAuthorizations(); // Refresh list
    } catch (err: any) {
        let errorMessage = err.message || `Failed to delete authorization ${authId}.`;

        if (errorMessage.includes("is used by another agent") || errorMessage.includes("is linked to a resource")) {
            const agentNameMatch = errorMessage.match(/(projects\/[^\s]+\/agents\/[^\s]+)/);
            if (agentNameMatch && agentNameMatch[0]) {
                const agentName = agentNameMatch[0];
                const agentId = agentName.split('/').pop() || agentName;
                errorMessage = `Cannot delete. Authorization is in use by agent: ${agentId}. Please delete this agent first.`;
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
        const authName = `projects/${projectNumber}/locations/global/authorizations/${authId}`;
        const authData = await api.getAuthorization(authName, apiConfig);
        setAuthToEdit(authData);
        setView('form');
    } catch (err: any) {
        setError(err.message || `Failed to fetch authorization ${authId} for editing.`);
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
    fetchAuthorizations();
  };

  const renderContent = () => {
    if (isLoading) { return <Spinner />; }
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
        onCreateNew={handleShowCreateForm}
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
            {view === 'list' && (
                <button 
                    onClick={fetchAuthorizations} 
                    disabled={isLoading}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? 'Loading...' : 'Refresh Authorizations'}
                </button>
            )}
        </div>
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
    </div>
  );
};

export default AuthorizationsPage;