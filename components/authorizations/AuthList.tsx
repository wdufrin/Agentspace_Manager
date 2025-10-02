
import React from 'react';
import { Authorization } from '../../types';

interface AuthListProps {
  authorizations: Authorization[];
  onDelete: (authId: string) => void;
  onEdit: (authId: string) => void;
  onCreateNew: () => void;
}

const AuthList: React.FC<AuthListProps> = ({ authorizations, onDelete, onEdit, onCreateNew }) => {
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Authorization Resources</h2>
        <button
          onClick={onCreateNew}
          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
        >
          Create New Authorization
        </button>
      </div>
      {authorizations.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No authorizations found for the provided project number.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Auth ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Client ID</th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {authorizations.map((auth) => {
                const authId = auth.name.split('/').pop() || '';
                return (
                  <tr key={auth.name} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white font-mono">{authId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{auth.serverSideOauth2.clientId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                      <button onClick={() => onEdit(authId)} className="font-semibold text-indigo-400 hover:text-indigo-300">
                        Edit
                      </button>
                      <button onClick={() => onDelete(authId)} className="font-semibold text-red-400 hover:text-red-300">
                        Delete
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

export default AuthList;