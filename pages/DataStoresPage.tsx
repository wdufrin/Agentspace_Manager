import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Collection, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import DataStoreList from '../components/datastores/DataStoreList';
import DataStoreDetails from '../components/datastores/DataStoreDetails';

interface DataStoresPageProps {
  accessToken: string;
  projectNumber: string;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('dataStoresPageConfig');
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }
  } catch (e) {
    console.error("Failed to parse config from sessionStorage", e);
    sessionStorage.removeItem('dataStoresPageConfig');
  }
  return {
    appLocation: 'global',
    collectionId: '',
  };
};

const DataStoresPage: React.FC<DataStoresPageProps> = ({ accessToken, projectNumber }) => {
  const [dataStores, setDataStores] = useState<DataStore[]>([]);
  const [selectedDataStore, setSelectedDataStore] = useState<DataStore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');
  
  const [config, setConfig] = useState(getInitialConfig);
  
  // State for dropdown options
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  
  // Save config to session storage on change
  useEffect(() => {
    sessionStorage.setItem('dataStoresPageConfig', JSON.stringify(config));
  }, [config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    if (name === 'appLocation') {
        setConfig(prev => ({...prev, collectionId: ''}));
        setCollections([]);
    }
  };

  const apiConfig: Config = useMemo(() => ({
      ...config,
      accessToken,
      projectId: projectNumber,
      // Dummy values for other required config properties
      appId: '',
      assistantId: '',
  }), [config, accessToken, projectNumber]);

  // Effect to fetch collections for dropdown
  useEffect(() => {
    if (!apiConfig.projectId || !apiConfig.appLocation || !apiConfig.accessToken) {
        setCollections([]);
        return;
    }
    const fetchCollections = async () => {
        setIsLoadingCollections(true);
        setCollections([]);
        try {
            const response = await api.listResources('collections', apiConfig);
            const fetchedCollections = response.collections || [];
            setCollections(fetchedCollections);
            // Auto-select if there is only one option
            if (fetchedCollections.length === 1) {
                const singleCollectionId = fetchedCollections[0].name.split('/').pop();
                if (singleCollectionId) {
                    setConfig(prev => ({ ...prev, collectionId: singleCollectionId }));
                }
            }
        } catch (err: any) {
            setError("Failed to fetch collections. " + err.message);
        } finally {
            setIsLoadingCollections(false);
        }
    };
    fetchCollections();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.accessToken]);


  const fetchDataStores = useCallback(async () => {
    if (!accessToken || !projectNumber || !config.collectionId) {
        setDataStores([]);
        setError("Access Token, Project ID/Number, and Collection ID are required to list data stores.");
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
  }, [apiConfig, accessToken, projectNumber, config.collectionId]);
  
  useEffect(() => {
    // Clear data stores if config changes and no auto-fetch is implemented
    setDataStores([]);
  }, [config.collectionId, config.appLocation, projectNumber]);

  const handleSelectDataStore = (dataStore: DataStore) => {
    setSelectedDataStore(dataStore);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setSelectedDataStore(null);
    setViewMode('list');
  };

  const renderContent = () => {
    if (!accessToken) {
      return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token to begin.</div>;
    }

    if (isLoading) { return <Spinner />; }

    if (viewMode === 'details' && selectedDataStore) {
        return (
            <DataStoreDetails
                dataStore={selectedDataStore}
                config={apiConfig}
                onBack={handleBackToList}
            />
        );
    }
    
    return (
      <>
        {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
        <DataStoreList
            dataStores={dataStores}
            onSelectDataStore={handleSelectDataStore}
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
                    <label htmlFor="collectionId" className="block text-sm font-medium text-gray-400 mb-1">Collection ID</label>
                    <select name="collectionId" value={config.collectionId} onChange={handleConfigChange} disabled={isLoadingCollections || collections.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[38px] disabled:bg-gray-700/50">
                    <option value="">{isLoadingCollections ? 'Loading...' : '-- Select a Collection --'}</option>
                    {collections.map(c => {
                        const collectionId = c.name.split('/').pop() || '';
                        return <option key={c.name} value={collectionId}>{c.displayName || collectionId}</option>
                    })}
                    </select>
                </div>
            </div>
            {viewMode === 'list' && (
                <button 
                    onClick={fetchDataStores} 
                    disabled={isLoading || !config.collectionId}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? 'Loading...' : 'Fetch Data Stores'}
                </button>
            )}
        </div>
      {renderContent()}
    </div>
  );
};

export default DataStoresPage;