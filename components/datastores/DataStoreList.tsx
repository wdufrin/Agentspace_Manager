import React from 'react';
import { DataStore } from '../../types';

interface DataStoreListProps {
  dataStores: DataStore[];
  onSelectDataStore: (dataStore: DataStore) => void;
}

const DataStoreList: React.FC<DataStoreListProps> = ({ dataStores, onSelectDataStore }) => {
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Data Stores</h2>
      </div>
      {dataStores.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No data stores found for the provided configuration. Click "Fetch Data Stores" to load them.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Solution Types</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {dataStores.map((store) => {
                return (
                  <tr key={store.name} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{store.displayName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{store.solutionTypes?.join(', ')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                            onClick={() => onSelectDataStore(store)}
                            className="font-semibold text-blue-400 hover:text-blue-300"
                        >
                            View
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