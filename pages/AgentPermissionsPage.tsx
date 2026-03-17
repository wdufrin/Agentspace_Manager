import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../services/apiService';
import { Agent, AppEngine, Config } from '../types';
import ProjectInput from '../components/ProjectInput';

interface AgentPermissionsPageProps {
    projectNumber: string;
    setProjectNumber: (projectNumber: string) => void;
}

interface PermissionRow {
    id: string;
    location: string;
    appName: string;
    agentName: string;
    agentType: string;
    userId: string;
    permission: 'owner' | 'user' | 'unknown';
}



const AgentPermissionsPage: React.FC<AgentPermissionsPageProps> = ({ projectNumber, setProjectNumber }) => {
    const [permissionsData, setPermissionsData] = useState<PermissionRow[]>(() => {
        try {
            const saved = sessionStorage.getItem('agentPermissionsData');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    useEffect(() => {
        sessionStorage.setItem('agentPermissionsData', JSON.stringify(permissionsData));
    }, [permissionsData]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [filters, setFilters] = useState({
        location: '',
        appName: '',
        agentName: '',
        agentType: '',
        userId: '',
        permission: ''
    });

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const filteredData = useMemo(() => {
        return permissionsData.filter(row => {
            return (
                row.location.toLowerCase().includes(filters.location.toLowerCase()) &&
                row.appName.toLowerCase().includes(filters.appName.toLowerCase()) &&
                row.agentName.toLowerCase().includes(filters.agentName.toLowerCase()) &&
                row.agentType.toLowerCase().includes(filters.agentType.toLowerCase()) &&
                row.userId.toLowerCase().includes(filters.userId.toLowerCase()) &&
                row.permission.toLowerCase().includes(filters.permission.toLowerCase())
            );
        });
    }, [permissionsData, filters]);

    const exportToCsv = () => {
        if (filteredData.length === 0) return;
        const headers = ['Location', 'Gemini Enterprise App', 'Agent Name', 'Agent Type', 'User ID', 'Permission'];
        const csvRows = [headers.join(',')];
        
        filteredData.forEach(row => {
            csvRows.push(`"${row.location}","${row.appName}","${row.agentName}","${row.agentType}","${row.userId}","${row.permission}"`);
        });
        
        const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(csvBlob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'agent_permissions_export.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const [config, setConfig] = useState(() => ({
        appId: '',
        appLocation: 'global',
        collectionId: 'default_collection',
        assistantId: 'default_assistant',
    }));

    const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const handleProjectNumberChange = (newValue: string) => {
        setProjectNumber(newValue);
        setConfig(prev => ({ ...prev, appId: '' }));
    };

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
        ...config,
        projectId: projectNumber,
    }), [config, projectNumber]);

    const fetchPermissions = useCallback(async () => {
        if (!apiConfig.projectId) {
            setError("Project must be selected to list permissions.");
            setPermissionsData([]);
            return;
        }

        setIsLoading(true);
        setError(null);
        // Do not clear permissionsData immediately so table isn't lost during load

        const rows: PermissionRow[] = [];
        const locationsToScan = ['global', 'us', 'eu'];

        try {
            // First fetch the project-level IAM policy to get inherited permissions
            let projectPolicy: any = { bindings: [] };
            try {
                projectPolicy = await api.getProjectIamPolicy(apiConfig.projectId!);
            } catch (projectErr) {
                console.warn("Could not fetch project IAM policy for inherited permissions", projectErr);
            }

            // Extract inherited project roles related to agent access
            const inheritedBindings = projectPolicy.bindings?.filter((binding: any) => {
                if (!binding.role) return false;
                const role = binding.role.toLowerCase();
                // We care about project-level owner/editor/viewer, or any discovery engine specific role
                return role.includes('roles/owner') || 
                       role.includes('roles/editor') || 
                       role.includes('roles/viewer') || 
                       role.includes('roles/discoveryengine.');
            }) || [];
            
            for (const location of locationsToScan) {
                const locConfig = { ...apiConfig, appLocation: location };
                let appsInLocation: any[] = [];
                try {
                    const enginesResponse = await api.listResources('engines', locConfig);
                    appsInLocation = enginesResponse.engines || [];
                } catch (appErr) {
                    console.warn(`Could not list apps in location ${location}`, appErr);
                }

                for (const app of appsInLocation) {
                    const appId = app.name.split('/').pop()!;
                    const appConfig = { ...locConfig, appId };
                    const appName = app.displayName || appId;

                try {
                    const assistantsResponse = await api.listResources('assistants', appConfig);
                    const assistants: any[] = assistantsResponse.assistants || [];

                    for (const assistant of assistants) {
                        const assistantConfig = { ...appConfig, assistantId: assistant.name.split('/').pop()! };

                try {
                    const agentsResponse = await api.listResources('agents', assistantConfig);
                    const agents: Agent[] = agentsResponse.agents || [];

                    for (const agent of agents) {
                        try {
                            const policy = await api.getAgentIamPolicy(agent.name, locConfig);
                            const specificBindings = policy.bindings || [];

                            // Combine specific bindings with inherited project bindings
                            const allBindings = [
                                ...specificBindings.map((b: any) => ({ ...b, isInherited: false })),
                                ...inheritedBindings.map((b: any) => ({ ...b, isInherited: true }))
                            ];

                            if (allBindings.length === 0) {
                                // If literally no permissions exist (extremely rare if project inherits are caught)
                                rows.push({
                                    id: `${agent.name}-none-none`,
                                    location: location,
                                    appName: appName,
                                    agentName: agent.displayName,
                                    agentType: agent.adkAgentDefinition ? 'ADK' : (agent.lowCodeAgentDefinition ? 'Low-Code' : (agent.agentType || 'N/A')),
                                    userId: 'No Members',
                                    permission: 'unknown'
                                });
                            }

                            // Keep track of added standard combinations to prevent massive duplication 
                            // if a user has both a project role and a specific role
                            const seenUserRoles = new Set<string>();

                            for (const binding of allBindings) {
                                const role = binding.role || '';
                                let permissionType: 'owner' | 'user' | 'unknown' = 'unknown';
                                const lowerRole = role.toLowerCase();
                                
                                if (lowerRole.includes('admin') || lowerRole.includes('editor') || lowerRole.includes('owner')) {
                                    permissionType = 'owner';
                                } else if (lowerRole.includes('viewer') || lowerRole.includes('user')) {
                                    permissionType = 'user';
                                }

                                const members = binding.members || (lowerRole.includes('viewer') || lowerRole.includes('user') ? ['allUsers'] : []);
                                
                                for (const member of members) {
                                    let displayMember = member.replace(/^(user:|serviceAccount:|group:|domain:)/, '');
                                    
                                    // Append (Inherited) to the role conceptually, or just dedup
                                    const dedupKey = `${displayMember}-${permissionType}`;
                                    
                                    if (!seenUserRoles.has(dedupKey)) {
                                        seenUserRoles.add(dedupKey);
                                        rows.push({
                                            id: `${agent.name}-${member}-${role}-${binding.isInherited ? 'inherited' : 'explicit'}`,
                                            location: location,
                                            appName: appName,
                                            agentName: agent.displayName,
                                            agentType: agent.adkAgentDefinition ? 'ADK' : (agent.lowCodeAgentDefinition ? 'Low-Code' : (agent.agentType || 'N/A')),
                                            userId: displayMember + (binding.isInherited ? ' (Inherited)' : ''),
                                            permission: permissionType
                                        });
                                    }
                                }
                            }
                        } catch (policyErr) {
                            console.warn(`Could not get IAM policy for agent ${agent.displayName}`, policyErr);
                        }
                    }
                } catch (agentErr) {
                    console.warn(`Could not list agents for assistant ${assistant.displayName}`, agentErr);
                }
                    }
                } catch (appErr) {
                    console.warn(`Could not list assistants for app ${appName}`, appErr);
                }
                } // end app loop
            } // end locations loop

            setPermissionsData(rows);
            if (rows.length === 0) {
                console.log("No explicit IAM permissions found on agents across any location.");
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred while fetching permissions.');
            setPermissionsData([]);
        } finally {
            setIsLoading(false);
        }
    }, [apiConfig]);

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={fetchPermissions}
                            disabled={isLoading}
                            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                        >
                            {isLoading ? 'Loading...' : 'Refetch All Locations'}
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-lg">
                    {error}
                </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
                {!isLoading && permissionsData.length > 0 && (
                    <div className="bg-gray-800/30 border-b border-gray-800 px-6 py-3 flex justify-between items-center">
                        <span className="text-sm text-gray-400">
                            Showing {filteredData.length} of {permissionsData.length} records
                        </span>
                        <button onClick={exportToCsv} disabled={filteredData.length === 0} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 text-sm font-medium rounded transition-colors disabled:opacity-50">
                            Export to CSV
                        </button>
                    </div>
                )}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-500 space-y-4">
                        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                        <p>Fetching IAM policies...</p>
                    </div>
                ) : permissionsData.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-800/50 text-gray-400 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Location</div>
                                        <input type="text" name="location" value={filters.location} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Gemini Enterprise App</div>
                                        <input type="text" name="appName" value={filters.appName} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Agent Name</div>
                                        <input type="text" name="agentName" value={filters.agentName} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Agent Type</div>
                                        <input type="text" name="agentType" value={filters.agentType} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>User ID</div>
                                        <input type="text" name="userId" value={filters.userId} onChange={handleFilterChange} placeholder="Filter" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                    <th className="px-6 py-4 font-medium border-b border-gray-800">
                                        <div>Permission</div>
                                        <input type="text" name="permission" value={filters.permission} onChange={handleFilterChange} placeholder="owner / user" className="mt-2 text-xs bg-gray-700/50 border border-gray-600 rounded px-2 py-1 outline-none text-white w-full max-w-[150px]" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50 text-sm">
                                {filteredData.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                                            {row.location}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-200 font-medium">
                                            {row.appName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {row.agentName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-400">
                                            {row.agentType}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-400 font-mono text-xs">
                                            {row.userId}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${row.permission === 'owner'
                                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                : row.permission === 'user'
                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                    : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                                                }`}>
                                                {row.permission}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <p className="text-lg font-medium text-gray-400">No agent permissions found.</p>
                        <p className="text-sm mt-1">Select a project and click refetch to globally scan all agent permissions.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AgentPermissionsPage;
