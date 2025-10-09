import React from 'react';
import { DataStore } from '../../types';

interface DataStoreListProps {
  dataStores: DataStore[];
  onSelectDataStore: (dataStore: DataStore) => void;
  onDeleteDataStore: (dataStore: DataStore) => void;
  deletingDataStoreIds: Set<string>;
  selectedDataStores: Set<string>;
  onToggleSelect: (name: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
}

const DataStoreList: React.FC<DataStoreListProps> = ({ 
  dataStores, 
  onSelectDataStore, 
  onDeleteDataStore, 
  deletingDataStoreIds,
  selectedDataStores,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected
}) => {
  const isAllSelected = dataStores.length > 0 && selectedDataStores.size === dataStores.length;
  
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Data Stores</h2>
        {selectedDataStores.size > 0 && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300">{selectedDataStores.size} selected</span>
            <button
              onClick={onDeleteSelected}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700"
            >
              Delete Selected
            </button>
          </div>
        )}
      </div>
      {dataStores.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No data stores found for the provided configuration. Click "Fetch Data Stores" to load them.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-3">
                  <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={onToggleSelectAll}
                      aria-label="Select all data stores"
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Solution Types</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {dataStores.map((store) => {
                const isDeleting = deletingDataStoreIds.has(store.name);
                const isSelected = selectedDataStores.has(store.name);

                return (
                  <tr key={store.name} className={`${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} transition-colors`}>
                    <td className="px-6 py-4">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(store.name)}
                            aria-label={`Select data store ${store.displayName}`}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                        />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{store.displayName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{store.solutionTypes?.join(', ')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                        <button
                            onClick={() => onSelectDataStore(store)}
                            className="font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500"
                            disabled={isDeleting}
                        >
                            View
                        </button>
                        <button
                            onClick={() => onDeleteDataStore(store)}
                            className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500"
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DataStoreList;