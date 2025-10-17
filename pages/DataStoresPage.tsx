import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Collection, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import DataStoreList from '../components/datastores/DataStoreList';
import DataStoreDetails from '../components/datastores/DataStoreDetails';
import ConfirmationModal from '../components/ConfirmationModal';

interface DataStoresPageProps {
  projectNumber: string;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('dataStoresPageConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.collectionId; // remove deprecated key
      return parsed;
    }
  } catch (e) {
    console.error("Failed to parse config from sessionStorage", e);
    sessionStorage.removeItem('dataStoresPageConfig');
  }
  return {
    appLocation: 'global',
  };
};

const DataStoresPage: React.FC<DataStoresPageProps> = ({ projectNumber }) => {
  const [dataStores, setDataStores] = useState<DataStore[]>([]);
  const [selectedDataStore, setSelectedDataStore] = useState<DataStore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');

  // State for deletion
  const [selectedDataStores, setSelectedDataStores] = useState<Set<string>>(new Set());
  const [deletingDataStoreIds, setDeletingDataStoreIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [dataStoresToDelete, setDataStoresToDelete] = useState<DataStore[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [config, setConfig] = useState(() => ({
    ...getInitialConfig(),
    collectionId: 'default_collection',
  }));
  
  // Save config to session storage on change
  useEffect(() => {
    const { appLocation } = config;
    sessionStorage.setItem('dataStoresPageConfig', JSON.stringify({ appLocation }));
  }, [config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
      // Dummy values for other required config properties
      appId: '',
      assistantId: '',
  }), [config, projectNumber]);

  const fetchDataStores = useCallback(async () => {
    if (!projectNumber || !config.collectionId) {
        setDataStores([]);
        setError("Project ID/Number and Collection ID are required to list data stores.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listResources('dataStores', apiConfig);
      setDataStores(response.dataStores || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data stores.');
      setDataStores([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, projectNumber, config.collectionId]);
  
  useEffect(() => {
    // Clear data stores if config changes and no auto-fetch is implemented
    setDataStores([]);
    setSelectedDataStores(new Set());
  }, [config.appLocation, projectNumber]);

  const pollDiscoveryOperation = async (operation: any) => {
    let currentOperation = operation;
    while (!currentOperation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        currentOperation = await api.getDiscoveryOperation(currentOperation.name, apiConfig);
    }
    if (currentOperation.error) {
        throw new Error(`Operation failed: ${currentOperation.error.message}`);
    }
    return currentOperation.response;
  };

  const handleToggleSelect = (dataStoreName: string) => {
    setSelectedDataStores(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dataStoreName)) {
        newSet.delete(dataStoreName);
      } else {
        newSet.add(dataStoreName);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedDataStores.size === dataStores.length) {
      setSelectedDataStores(new Set());
    } else {
      setSelectedDataStores(new Set(dataStores.map(ds => ds.name)));
    }
  };

  const handleRequestDelete = (dataStore?: DataStore) => {
    let toDelete: DataStore[] = [];
    if (dataStore) {
      toDelete = [dataStore];
    } else {
      toDelete = dataStores.filter(ds => selectedDataStores.has(ds.name));
    }

    if (toDelete.length > 0) {
      setDataStoresToDelete(toDelete);
      setIsDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (dataStoresToDelete.length === 0) return;

    setIsDeleting(true);
    setDeletingDataStoreIds(new Set(dataStoresToDelete.map(ds => ds.name)));
    setIsDeleteModalOpen(false);
    setError(null);

    const results = await Promise.allSettled(
        dataStoresToDelete.map(ds => api.deleteDataStore(ds.name, apiConfig).then(op => pollDiscoveryOperation(op)))
    );

    const failures: string[] = [];
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const dsName = dataStoresToDelete[index].displayName;
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            failures.push(`- ${dsName}: ${reason}`);
        }
    });

    if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} data store(s):\n${failures.join('\n')}`);
    }
    
    // If we were on the details page of one of the deleted items, go back to list
    if (selectedDataStore && dataStoresToDelete.some(ds => ds.name === selectedDataStore.name)) {
        setViewMode('list');
        setSelectedDataStore(null);
    }
    
    setDataStoresToDelete([]);
    setSelectedDataStores(new Set());
    await fetchDataStores(); // Refresh the list

    setIsDeleting(false);
    setDeletingDataStoreIds(new Set());
  };


  const handleSelectDataStore = (dataStore: DataStore) => {
    setSelectedDataStore(dataStore);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setSelectedDataStore(null);
    setViewMode('list');
  };

  const renderContent = () => {
    if (isLoading) { return <Spinner />; }

    if (viewMode === 'details' && selectedDataStore) {
        return (
            <DataStoreDetails
                dataStore={selectedDataStore}
                config={apiConfig}
                onBack={handleBackToList}
                onDelete={handleRequestDelete}
                isDeleting={deletingDataStoreIds.has(selectedDataStore.name)}
            />
        );
    }
    
    return (
      <>
        {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg whitespace-pre-wrap">{error}</div>}
        <DataStoreList
            dataStores={dataStores}
            onSelectDataStore={handleSelectDataStore}
            onDeleteDataStore={handleRequestDelete}
            deletingDataStoreIds={deletingDataStoreIds}
            selectedDataStores={selectedDataStores}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onDeleteSelected={() => handleRequestDelete()}
        />
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                    <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                        {projectNumber || <span className="text-gray-500 italic">Not set (configure on Agents page)</span>}
                    </div>
                </div>
                 <div>
                    <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                    <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[38px]">
                        <option value="global">global</option>
                        <option value="us">us</option>
                        <option value="eu">eu</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Collection ID</label>
                    <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                        default_collection
                    </div>
                </div>
            </div>
            {viewMode === 'list' && (
                <button 
                    onClick={fetchDataStores} 
                    disabled={isLoading}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? 'Loading...' : 'Fetch Data Stores'}
                </button>
            )}
        </div>
      {renderContent()}

      {dataStoresToDelete.length > 0 && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDelete}
            title={`Confirm Deletion of ${dataStoresToDelete.length} Data Store(s)`}
            confirmText="Delete"
            isConfirming={isDeleting}
        >
            <p>Are you sure you want to permanently delete the following data store(s)?</p>
            <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
                {dataStoresToDelete.map(ds => (
                    <li key={ds.name} className="text-sm">
                        <p className="font-bold text-white">{ds.displayName}</p>
                        <p className="text-xs font-mono text-gray-400 mt-1">{ds.name.split('/').pop()}</p>
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-sm text-yellow-300">This action cannot be undone and will delete all documents within the store(s).</p>
        </ConfirmationModal>
      )}
    </div>
  );
};

export default DataStoresPage;