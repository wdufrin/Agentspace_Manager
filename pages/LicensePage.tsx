
import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../services/apiService';
import { Config } from '../types';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import JsonViewModal from '../components/license/JsonViewModal';
import PruneLicensesModal from '../components/license/PruneLicensesModal';
import ConfirmationModal from '../components/ConfirmationModal';

interface LicensePageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

type SortKey = 'userPrincipal' | 'licenseAssignmentState' | 'licenseConfig' | 'lastLoginTime';
type SortDirection = 'asc' | 'desc';

const LicensePage: React.FC<LicensePageProps> = ({ projectNumber, setProjectNumber }) => {
  // --- Cloud License API State ---
  const [apiConfig, setApiConfig] = useState({
      appLocation: 'global',
      userStoreId: 'default_user_store',
  });
  
  // User Licenses List State
  const [userLicenses, setUserLicenses] = useState<any[]>([]);
  const [userLicensesFilter, setUserLicensesFilter] = useState('');
  const [isLicensesLoading, setIsLicensesLoading] = useState(false);
  const [licensesError, setLicensesError] = useState<string | null>(null);
  
  // License Config Names Cache
  const [licenseNames, setLicenseNames] = useState<Record<string, string>>({});

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
      key: 'lastLoginTime',
      direction: 'desc'
  });

  // Modal States
  const [jsonModalData, setJsonModalData] = useState<any | null>(null);
  const [isPruneModalOpen, setIsPruneModalOpen] = useState(false);
  
  // Single Delete State
  const [licenseToDelete, setLicenseToDelete] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  const [isActionLoading, setIsActionLoading] = useState(false); // For delete/prune

  // --- Auto Fetch Data ---
  useEffect(() => {
      if (projectNumber) {
          fetchUserLicenses();
      }
  }, [projectNumber, apiConfig.appLocation, apiConfig.userStoreId]);

  // --- Cloud License Logic ---
  const handleApiConfigChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setApiConfig({ ...apiConfig, [e.target.name]: e.target.value });
  };

  const fetchUserLicenses = async () => {
      if (!projectNumber) return;
      setIsLicensesLoading(true);
      setLicensesError(null);
      
      try {
          const config: Config = {
              projectId: projectNumber,
              appLocation: apiConfig.appLocation,
              // Dummy values
              collectionId: '', appId: '', assistantId: ''
          } as any;

          let allLicenses: any[] = [];
          let nextPageToken: string | undefined = undefined;

          do {
              // Fetch maximum allowed page size (50) to minimize requests
              const result: any = await api.listUserLicenses(config, apiConfig.userStoreId, userLicensesFilter, nextPageToken, 50);
              if (result.userLicenses) {
                  allLicenses = [...allLicenses, ...result.userLicenses];
              }
              nextPageToken = result.nextPageToken;
          } while (nextPageToken);

          setUserLicenses(allLicenses);
          
          // Resolve friendly names for license configs
          resolveLicenseNames(allLicenses);
          
      } catch (err: any) {
          setLicensesError(err.message || "Failed to list user licenses.");
      } finally {
          setIsLicensesLoading(false);
      }
  };
  
  const resolveLicenseNames = async (licenses: any[]) => {
      // Get all unique license config resource names
      const uniqueConfigNames = Array.from(new Set(licenses.map((l: any) => l.licenseConfig).filter((c: any) => typeof c === 'string')));
      
      // Filter out ones we already have in cache
      const toFetch = uniqueConfigNames.filter(name => !licenseNames[name]);
      
      if (toFetch.length === 0) return;

      const newNames: Record<string, string> = {};
      
      // We need a config object for the API call
      const configForApi: Config = {
          projectId: projectNumber,
          appLocation: apiConfig.appLocation,
          // Dummy values
          collectionId: '', appId: '', assistantId: ''
      } as any;

      // Fetch details for missing configs
      await Promise.allSettled(toFetch.map(async (name) => {
          try {
              const details = await api.getLicenseConfig(name, configForApi);
              if (details.displayName) {
                  newNames[name] = details.displayName;
              } else {
                  // If no display name, fallback to ID
                  newNames[name] = name.split('/').pop() || name;
              }
          } catch (e) {
              console.warn(`Failed to fetch license config details for ${name}`, e);
              // Fallback to ID on error
              newNames[name] = name.split('/').pop() || name;
          }
      }));

      setLicenseNames(prev => ({ ...prev, ...newNames }));
  };
  
  const requestDelete = (license: any) => {
      setLicenseToDelete(license);
      setIsDeleteModalOpen(true);
  };

  const confirmSingleDelete = async () => {
      if (!licenseToDelete) return;
      
      const userPrincipal = licenseToDelete.userPrincipal;

      if (!userPrincipal) {
          setLicensesError("Cannot delete: The license is missing the 'userPrincipal' (email) field required for revocation.");
          setIsDeleteModalOpen(false);
          return;
      }
      
      setIsActionLoading(true);
      setLicensesError(null);
      try {
          const config: Config = {
              projectId: projectNumber,
              appLocation: apiConfig.appLocation,
               // Dummy values
              collectionId: '', appId: '', assistantId: ''
          } as any;
          
          // Use the batch update endpoint to unassign the license
          await api.revokeUserLicenses(config, apiConfig.userStoreId, [userPrincipal]);
          
          // Optimistic update: Remove from local state immediately
          setUserLicenses(prev => prev.filter(l => l.userPrincipal !== userPrincipal));
          
          // Fetch in background to ensure sync
          fetchUserLicenses();
      } catch (err: any) {
          setLicensesError(`Failed to delete license: ${err.message}`);
          // Re-fetch if failed to ensure state is correct
          fetchUserLicenses();
      } finally {
          setIsActionLoading(false);
          setIsDeleteModalOpen(false);
          setLicenseToDelete(null);
      }
  };

  const handlePrune = async (days: number) => {
      setIsActionLoading(true);
      setLicensesError(null);
      try {
          const config: Config = {
              projectId: projectNumber,
              appLocation: apiConfig.appLocation,
               // Dummy values
              collectionId: '', appId: '', assistantId: ''
          } as any;
          
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          
          const toDelete = userLicenses.filter(l => {
              if (!l.lastLoginTime) return false;
              return new Date(l.lastLoginTime) < cutoff;
          });

          const principals = toDelete.map(l => l.userPrincipal).filter(Boolean);

          if (principals.length > 0) {
              await api.revokeUserLicenses(config, apiConfig.userStoreId, principals);
              
              // Optimistic update
              const principalSet = new Set(principals);
              setUserLicenses(prev => prev.filter(l => !principalSet.has(l.userPrincipal)));
          }
          
          setIsPruneModalOpen(false);
          
          // Fetch in background
          fetchUserLicenses();

      } catch (err: any) {
          setLicensesError(`Error during prune operation: ${err.message}`);
      } finally {
          setIsActionLoading(false);
      }
  };

  const handleSort = (key: SortKey) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const sortedUserLicenses = useMemo(() => {
      if (!userLicenses) return [];
      
      return [...userLicenses].sort((a, b) => {
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          
          if (sortConfig.key === 'lastLoginTime') {
              const dateA = aVal ? new Date(aVal).getTime() : 0;
              const dateB = bVal ? new Date(bVal).getTime() : 0;
              return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
          }
          
          // Special sorting for resolved license names
          if (sortConfig.key === 'licenseConfig') {
              const nameA = licenseNames[a.licenseConfig] || a.licenseConfig || '';
              const nameB = licenseNames[b.licenseConfig] || b.licenseConfig || '';
              if (nameA < nameB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (nameA > nameB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          }

          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [userLicenses, sortConfig, licenseNames]);

  // Calculate total used licenses from the full fetched list
  const totalLicensesUsed = useMemo(() => {
      return userLicenses.filter(l => l.licenseAssignmentState === 'ASSIGNED').length;
  }, [userLicenses]);

  const SortIcon = ({ active, direction }: { active: boolean, direction: SortDirection }) => (
      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-1 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`} viewBox="0 0 20 20" fill="currentColor">
           {active && direction === 'desc' ? (
               <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
           ) : (
               <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 010 1.414z" clipRule="evenodd" />
           )}
      </svg>
  );

  return (
    <div className="space-y-6">
      <JsonViewModal 
          isOpen={!!jsonModalData} 
          onClose={() => setJsonModalData(null)} 
          data={jsonModalData} 
          title={jsonModalData?.userPrincipal ? `Details: ${jsonModalData.userPrincipal}` : 'License Details'}
      />
      <PruneLicensesModal
          isOpen={isPruneModalOpen}
          onClose={() => setIsPruneModalOpen(false)}
          onConfirm={handlePrune}
          userLicenses={userLicenses}
          isDeleting={isActionLoading}
      />
      
      {licenseToDelete && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmSingleDelete}
            title="Revoke License"
            confirmText="Revoke"
            isConfirming={isActionLoading}
        >
            <p>Are you sure you want to revoke the license for <strong>{licenseToDelete.userPrincipal}</strong>?</p>
            <p className="text-gray-400 text-xs mt-2">This will remove the license assignment immediately.</p>
        </ConfirmationModal>
      )}

      {/* --- Common Configuration --- */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
         <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <ProjectInput value={projectNumber} onChange={setProjectNumber} />
            </div>
            <div>
                <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                <select name="appLocation" value={apiConfig.appLocation} onChange={handleApiConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[38px]">
                    <option value="global">global</option>
                    <option value="us">us</option>
                    <option value="eu">eu</option>
                </select>
            </div>
            <div>
                <label htmlFor="userStoreId" className="block text-sm font-medium text-gray-400 mb-1">User Store ID</label>
                <input 
                    type="text" 
                    name="userStoreId" 
                    value={apiConfig.userStoreId} 
                    onChange={handleApiConfigChange} 
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white w-full h-[38px]"
                />
            </div>
        </div>
      </div>

      {/* --- Stats & Actions Row --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-md flex flex-col justify-center items-center border border-gray-700">
             <h3 className="text-gray-400 text-sm uppercase font-bold tracking-wider mb-1">Total Licenses Used</h3>
             {isLicensesLoading && userLicenses.length === 0 ? (
                 <Spinner />
             ) : (
                 <p className="text-5xl font-extrabold text-blue-400">{totalLicensesUsed}</p>
             )}
        </div>

        {/* Filter & Actions Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-md md:col-span-2 flex flex-col justify-between">
            <div>
                <h2 className="text-lg font-semibold text-white mb-1">Manage User Licenses</h2>
                <p className="text-gray-400 text-sm mb-4">View, filter, and manage the list of assigned licenses.</p>
                <div className="flex flex-col sm:flex-row gap-3">
                     <input 
                        type="text" 
                        value={userLicensesFilter}
                        onChange={(e) => setUserLicensesFilter(e.target.value)}
                        placeholder='Filter (e.g. license_assignment_state=ASSIGNED)'
                        className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white flex-grow h-[38px]"
                    />
                    <button 
                        onClick={fetchUserLicenses} 
                        disabled={isLicensesLoading || !projectNumber}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
                    >
                        {isLicensesLoading ? 'Loading...' : 'Refresh List'}
                    </button>
                    <button 
                        onClick={() => setIsPruneModalOpen(true)}
                        disabled={isLicensesLoading || !projectNumber || userLicenses.length === 0}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
                    >
                        Prune Inactive
                    </button>
                </div>
            </div>
        </div>
      </div>
      
      {/* --- User Licenses Table --- */}
      <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
         {licensesError && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-t-lg border-b border-red-800">{licensesError}</div>}

        {userLicenses.length > 0 ? (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 bg-gray-900">
                    <thead className="bg-gray-700/50">
                        <tr>
                            <th 
                                scope="col" 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white hover:bg-gray-700"
                                onClick={() => handleSort('userPrincipal')}
                            >
                                <div className="flex items-center">
                                    User Principal
                                    <SortIcon active={sortConfig.key === 'userPrincipal'} direction={sortConfig.direction} />
                                </div>
                            </th>
                            <th 
                                scope="col" 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white hover:bg-gray-700"
                                onClick={() => handleSort('licenseAssignmentState')}
                            >
                                <div className="flex items-center">
                                    State
                                    <SortIcon active={sortConfig.key === 'licenseAssignmentState'} direction={sortConfig.direction} />
                                </div>
                            </th>
                            <th 
                                scope="col" 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white hover:bg-gray-700"
                                onClick={() => handleSort('licenseConfig')}
                            >
                                <div className="flex items-center">
                                    License Config
                                    <SortIcon active={sortConfig.key === 'licenseConfig'} direction={sortConfig.direction} />
                                </div>
                            </th>
                             <th 
                                scope="col" 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                            >
                                License ID
                            </th>
                            <th 
                                scope="col" 
                                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white hover:bg-gray-700"
                                onClick={() => handleSort('lastLoginTime')}
                            >
                                <div className="flex items-center">
                                    Last Login
                                    <SortIcon active={sortConfig.key === 'lastLoginTime'} direction={sortConfig.direction} />
                                </div>
                            </th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-gray-800 divide-y divide-gray-700">
                        {sortedUserLicenses.map((license, idx) => {
                            const resourceName = license.licenseConfig || '';
                            const friendlyName = licenseNames[resourceName] || resourceName.split('/').pop() || 'N/A';
                            
                            const isAssigned = license.licenseAssignmentState === 'ASSIGNED';
                            const licenseId = license.name ? license.name.split('/').pop() : (license.userPrincipal ? <span className="text-gray-500 italic">(will infer)</span> : <span className="text-red-400 italic">Missing</span>);

                            return (
                                <tr key={idx} className="hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                        {license.userPrincipal || 'Unknown User'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${isAssigned ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-700 text-gray-400'}`}>
                                            {license.licenseAssignmentState}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300" title={resourceName}>
                                        {friendlyName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                                        {licenseId}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {license.lastLoginTime ? new Date(license.lastLoginTime).toLocaleString() : 'Never'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end gap-3">
                                            <button 
                                                onClick={() => setJsonModalData(license)}
                                                className="text-blue-400 hover:text-blue-300 flex items-center"
                                                title="View Raw JSON"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            <button 
                                                onClick={() => requestDelete(license)}
                                                className="text-red-400 hover:text-red-300 flex items-center"
                                                disabled={isActionLoading}
                                                title="Delete License"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        ) : (
             !isLicensesLoading && <div className="text-gray-500 text-center p-8 bg-gray-800">No user licenses found matching criteria.</div>
        )}
      </div>
    </div>
  );
};

export default LicensePage;
