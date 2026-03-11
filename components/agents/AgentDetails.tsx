/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import React, { useState } from 'react';
import { Agent, Config, DataStore } from '../../types';
import * as api from '../../services/apiService';
import { runBigQueryQuery } from '../../services/apiService';
import Spinner from '../Spinner';
import SetIamPolicyModal from './SetIamPolicyModal';

interface AgentDetailsProps {
    agent: Agent;
    config: Config;
    onBack: () => void;
    onEdit: () => void;
    onDeleteSuccess: () => void;
    onToggleStatus: (agent: Agent) => void;
    togglingAgentId: string | null;
    error: string | null;
}

const DetailItem: React.FC<{ label: string; value: string | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded">{value || 'Not set'}</dd>
    </div>
);

const AgentDetails: React.FC<AgentDetailsProps> = ({ agent, config, onBack, onEdit, onDeleteSuccess, onToggleStatus, togglingAgentId, error: pageError }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'metrics'>('details');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [agentViewData, setAgentViewData] = useState<any | null>(null);
    const [isFetchingView, setIsFetchingView] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);
    const [iamPolicy, setIamPolicy] = useState<any | null>(null);
    const [isFetchingPolicy, setIsFetchingPolicy] = useState(false);
    const [policyError, setPolicyError] = useState<string | null>(null);
    const [isSetPolicyModalOpen, setIsSetPolicyModalOpen] = useState(false);
    const [policySuccess, setPolicySuccess] = useState<string | null>(null);
    
    // Sharing state
    const [isSharing, setIsSharing] = useState(false);
    const [shareError, setShareError] = useState<string | null>(null);

    // State for accessible data stores
    const [accessibleDataStores, setAccessibleDataStores] = useState<DataStore[] | null>(null);
    const [isFetchingDataStores, setIsFetchingDataStores] = useState(false);
    const [dataStoresError, setDataStoresError] = useState<string | null>(null);

    // State for copying agent card
    const [copyCardSuccess, setCopyCardSuccess] = useState<string | null>(null);

    // State for Metrics Tab
    const [bqProjectId, setBqProjectId] = useState<string>(config.projectId || '');
    const [bqDatasetId, setBqDatasetId] = useState<string>('gemini_audit_logs');
    const [metricsData, setMetricsData] = useState<any[] | null>(null);
    const [isFetchingMetrics, setIsFetchingMetrics] = useState(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);

    const agentId = agent.name.split('/').pop() || '';
    const isToggling = togglingAgentId === agentId;
    const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';

    const handleDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await api.deleteResource(agent.name, config);
            onDeleteSuccess();
        } catch (err: any) {
            setDeleteError(err.message || 'Failed to delete agent.');
        } finally {
            setIsDeleting(false);
        }
    };
    
    const handleShare = async () => {
        setIsSharing(true);
        setShareError(null);
        try {
            await api.shareAgent(agent.name, config);
            // Refresh the page data by calling the back callback which usually triggers a list refresh or similar
            // In a more complex app we might update the local agent state or call a refresh prop.
            // For now, let's just go back to force a refresh of the list where this agent was selected.
            onBack();
        } catch (err: any) {
            setShareError(err.message || 'Failed to share agent.');
        } finally {
            setIsSharing(false);
        }
    };

    const handleFetchAgentView = async () => {
        setIsFetchingView(true);
        setViewError(null);
        setAgentViewData(null);
        try {
            const viewData = await api.getAgentView(agent.name, config);
            setAgentViewData(viewData);
        } catch (err: any) {
            setViewError(err.message || 'Failed to fetch agent view.');
        } finally {
            setIsFetchingView(false);
        }
    };

    const handleFetchIamPolicy = async () => {
        setIsFetchingPolicy(true);
        setPolicyError(null);
        setPolicySuccess(null);
        setIamPolicy(null);
        try {
            const policyData = await api.getAgentIamPolicy(agent.name, config);
            setIamPolicy(policyData);
        } catch (err: any) {
            setPolicyError(err.message || 'Failed to fetch IAM policy.');
        } finally {
            setIsFetchingPolicy(false);
        }
    };

    const handleSetPolicySuccess = (updatedPolicy: any) => {
        setIamPolicy(updatedPolicy);
        setIsSetPolicyModalOpen(false);
        setPolicySuccess("IAM Policy updated successfully.");
        setTimeout(() => setPolicySuccess(null), 5000);
    };

    const handleFetchDataStores = async () => {
        setIsFetchingDataStores(true);
        setDataStoresError(null);
        setAccessibleDataStores(null);
        try {
            const viewData = await api.getAgentView(agent.name, config);

            const findDataStoreIds = (obj: any): string[] => {
                let ids: string[] = [];
                if (!obj || typeof obj !== 'object') return ids;

                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        const value = obj[key];
                        if (typeof value === 'string' && key.toLowerCase().includes('datastore') && value.startsWith('projects/') && value.includes('/dataStores/')) {
                            ids.push(value);
                        } else if (typeof value === 'object') {
                            ids = ids.concat(findDataStoreIds(value));
                        }
                    }
                }
                return ids;
            };

            const dataStoreIds = [...new Set(findDataStoreIds(viewData))];

            if (dataStoreIds.length === 0) {
                setAccessibleDataStores([]);
                return;
            }

            const dataStorePromises = dataStoreIds.map(id => api.getDataStore(id, config));
            const dataStoresResults = await Promise.all(dataStorePromises);
            setAccessibleDataStores(dataStoresResults);

        } catch (err: any) {
            setDataStoresError(err.message || 'Failed to fetch accessible data stores.');
        } finally {
            setIsFetchingDataStores(false);
        }
    };

    const handleCopyAgentCard = () => {
        if (agent.a2aAgentDefinition?.jsonAgentCard) {
            navigator.clipboard.writeText(agent.a2aAgentDefinition.jsonAgentCard);
            setCopyCardSuccess('Copied!');
            setTimeout(() => setCopyCardSuccess(null), 2000);
        }
    };


    const reasoningEngine = agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
    const toolDescription = agent.adkAgentDefinition?.toolSettings?.toolDescription;
    
    let statusElement = null;
    let isPrivate = false;

    if (agent.state === 'ENABLED' || agent.state === 'DISABLED') {
        const isEnabled = agent.state === 'ENABLED';
        const statusProps = {
            text: isEnabled ? 'Enabled' : 'Disabled',
            colorClasses: isEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
        };
        statusElement = (
            <div className="py-2">
                <dt className="text-sm font-medium text-gray-400">Status</dt>
                <dd className="mt-1 text-sm">
                    {isToggling ? (
                         <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-400"></div>
                            <span className="text-xs text-gray-400">Updating...</span>
                        </div>
                    ) : (
                         <button
                            onClick={() => onToggleStatus(agent)}
                            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${statusProps.colorClasses}`}
                            disabled={isToggling}
                        >
                            {statusProps.text}
                        </button>
                    )}
                </dd>
            </div>
        );
    } else {
        isPrivate = true;
        statusElement = (
            <div className="py-2">
                <dt className="text-sm font-medium text-gray-400">Status</dt>
                <dd className="mt-1 text-sm">
                     <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-black">Private</span>
                </dd>
            </div>
        );
    }

    const handleFetchMetrics = async () => {
        setIsFetchingMetrics(true);
        setMetricsError(null);
        setMetricsData(null);
        try {
            const filterId = reasoningEngine ? reasoningEngine.split('/').pop() : agentId;
            const query = `
                SELECT 
                    JSON_EXTRACT_SCALAR(data, '$.agent_id') as agent_id,
                    timestamp,
                    JSON_EXTRACT_SCALAR(data, '$.latency_ms') as latency_ms,
                    JSON_EXTRACT_SCALAR(data, '$.user_input') as user_input,
                    JSON_EXTRACT_SCALAR(data, '$.assistant_response') as assistant_response
                FROM \`${bqProjectId}.${bqDatasetId}.agent_logs\`
                WHERE JSON_EXTRACT_SCALAR(data, '$.agent_id') = '${filterId}'
                ORDER BY timestamp DESC
                LIMIT 50
            `;
            const result = await runBigQueryQuery(bqProjectId, query, config.accessToken);
            setMetricsData(result);
        } catch (err: any) {
            setMetricsError(err.message || 'Failed to fetch metrics from BigQuery.');
        } finally {
            setIsFetchingMetrics(false);
        }
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        <span className={`h-3 w-3 rounded-full mr-3 shrink-0 ${statusColorClass}`}></span>
                        {agent.icon?.uri && <img src={agent.icon.uri} alt="icon" className="h-8 w-8 rounded-full mr-3" />}
                        {agent.displayName}
                    </h2>
                    <p className="text-gray-400 mt-1">{agent.description}</p>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back to list</button>
            </div>

            <div className="mt-4 border-b border-gray-700">
                <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'details' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'}`}
                    >
                        Details
                    </button>
                    <button
                        onClick={() => setActiveTab('metrics')}
                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'metrics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'}`}
                    >
                        Metrics
                    </button>
                </nav>
            </div>

            {activeTab === 'details' && (
                <>
                    <dl className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="Full Resource Name" value={agent.name} />
                <DetailItem label="Agent ID" value={agentId} />
                {statusElement}
                <div /> 
                <DetailItem label="Created On" value={agent.createTime ? new Date(agent.createTime).toLocaleString() : undefined} />
                <DetailItem label="Last Modified" value={agent.updateTime ? new Date(agent.updateTime).toLocaleString() : undefined} />
                {reasoningEngine && <DetailItem label="Agent Engine" value={reasoningEngine} />}
                {toolDescription && <DetailItem label="Tool Description" value={toolDescription} />}
                <DetailItem label="Authorizations" value={agent.authorizationConfig?.toolAuthorizations?.join(', ') || agent.authorizations?.join(', ')} />
            </dl>
            
            {agent.starterPrompts && agent.starterPrompts.length > 0 && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Starter Prompts</h3>
                    <ul className="mt-2 space-y-2">
                        {agent.starterPrompts.map((prompt, index) => (
                            <li key={index} className="text-sm text-gray-200 bg-gray-700 p-3 rounded-md font-mono">
                                {prompt.text}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {pageError && <p className="text-red-400 mt-4">{pageError}</p>}
            {deleteError && <p className="text-red-400 mt-4">{deleteError}</p>}
            {shareError && <p className="text-red-400 mt-4">{shareError}</p>}


            <div className="mt-8 border-t border-gray-700 pt-6">
                <div className="flex flex-wrap items-start gap-4">
                    {/* Primary Actions */}
                    <div className="flex flex-wrap gap-4 p-4 border border-gray-700 rounded-lg bg-gray-900/30">
                        <div>
                            <h4 className="font-semibold text-white">Primary Actions</h4>
                            <p className="text-xs text-gray-400 mb-2">Modify this agent.</p>
                            <div className="flex flex-wrap gap-4">
                                {(agent.state === 'ENABLED' || agent.state === 'DISABLED') && (
                                     <button 
                                        onClick={onEdit} 
                                        title="Update agent's display name, description, tools, etc."
                                        className="px-5 py-2.5 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
                                    >
                                        Update Agent
                                    </button>
                                )}
                                {isPrivate && (
                                    <button 
                                        onClick={handleShare}
                                        disabled={isSharing}
                                        className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800 flex items-center gap-2"
                                        title="Enable sharing for this private (no-code) agent"
                                    >
                                        {isSharing ? (
                                             <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                                            </svg>
                                        )}
                                        Share Agent
                                    </button>
                                )}
                                {agent.a2aAgentDefinition?.jsonAgentCard && (
                                    <button 
                                        onClick={handleCopyAgentCard}
                                        className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
                                        title="Copy the A2A Agent Card JSON to clipboard"
                                    >
                                        {copyCardSuccess || 'Copy Agent Card'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Other Actions */}
                    <div className="flex flex-wrap gap-4 p-4 border border-gray-700 rounded-lg bg-gray-900/30 flex-1">
                         <div>
                            <h4 className="font-semibold text-white">Advanced Actions</h4>
                             <p className="text-xs text-gray-400 mb-2">Inspect data or perform destructive actions.</p>
                            <div className="flex flex-wrap gap-4">
                                 <button onClick={handleFetchAgentView} disabled={isFetchingView} className="px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-md hover:bg-teal-700 disabled:bg-teal-800">
                                    {isFetchingView ? 'Fetching...' : 'Get View'}
                                 </button>
                                <button onClick={handleFetchIamPolicy} disabled={isFetchingPolicy} className="px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-purple-800">
                                    {isFetchingPolicy ? 'Fetching...' : 'Get IAM Policy'}
                                </button>
                                 <button onClick={handleDelete} disabled={isDeleting} className="px-5 py-2.5 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800">
                                    {isDeleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {(agentViewData || viewError) && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Agent View Details</h3>
                    {viewError && <p className="text-red-400 mt-2">{viewError}</p>}
                    {agentViewData && (
                        <pre className="mt-2 bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto">
                            <code>{JSON.stringify(agentViewData, null, 2)}</code>
                        </pre>
                    )}
                </div>
            )}

            {(iamPolicy || policyError || isFetchingPolicy || policySuccess) && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">IAM Policy</h3>
                        <button 
                            onClick={() => setIsSetPolicyModalOpen(true)} 
                            disabled={!iamPolicy || isFetchingPolicy} 
                            className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed"
                            title={!iamPolicy ? "Fetch the policy first to get the required ETag" : "Edit IAM Policy"}
                        >
                            Edit Policy
                        </button>
                    </div>
                    {isFetchingPolicy && <Spinner />}
                    {policyError && <p className="text-red-400 mt-2">{policyError}</p>}
                    {policySuccess && <p className="text-green-400 mt-2">{policySuccess}</p>}
                    {iamPolicy && (
                        <pre className="mt-2 bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto">
                            <code>{JSON.stringify(iamPolicy, null, 2)}</code>
                        </pre>
                    )}
                </div>
            )}

            <div className="mt-6 border-t border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-white">Accessible Data Stores</h3>
                <p className="text-sm text-gray-400 mt-1 mb-4">View the Vertex AI Search data stores this agent has access to via its tools.</p>
                
                <button onClick={handleFetchDataStores} disabled={isFetchingDataStores} className="px-5 py-2.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-cyan-800">
                    {isFetchingDataStores ? 'Fetching...' : 'View Data Stores'}
                </button>
                
                <div className="mt-4">
                    {isFetchingDataStores && <Spinner />}
                    {dataStoresError && <p className="text-red-400 mt-2">{dataStoresError}</p>}
                    {accessibleDataStores && accessibleDataStores.length > 0 && (
                        <div className="bg-gray-900/50 rounded-lg border border-gray-700">
                             <ul className="divide-y divide-gray-700">
                                {accessibleDataStores.map(ds => (
                                    <li key={ds.name} className="p-3">
                                        <p className="font-medium text-white">{ds.displayName}</p>
                                        <p className="text-xs font-mono text-gray-400 mt-1">{ds.name.split('/').pop()}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {accessibleDataStores && accessibleDataStores.length === 0 && (
                         <p className="text-sm text-gray-400 italic">No data stores found in this agent's tool configuration.</p>
                    )}
                </div>
            </div>
            </>
            )}

            {activeTab === 'metrics' && (
                <div className="mt-6">
                    <div className="bg-gray-900/50 p-4 rounded border border-gray-700 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Target Project ID</label>
                                <input
                                    type="text"
                                    value={bqProjectId}
                                    onChange={(e) => setBqProjectId(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">BigQuery Dataset ID</label>
                                <input
                                    type="text"
                                    value={bqDatasetId}
                                    onChange={(e) => setBqDatasetId(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white font-mono text-sm focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="mt-4">
                            <button
                                onClick={handleFetchMetrics}
                                disabled={isFetchingMetrics || !bqProjectId || !bqDatasetId}
                                className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50"
                            >
                                {isFetchingMetrics ? 'Fetching Metrics...' : 'Load Agent Metrics from BigQuery'}
                            </button>
                            <p className="inline-block md:ml-4 mt-2 md:mt-0 text-xs text-gray-400 italic">Queries `{bqProjectId}.{bqDatasetId}.agent_logs` for Agent ID: {reasoningEngine ? reasoningEngine.split('/').pop() : agentId}</p>
                        </div>
                        {metricsError && <p className="text-red-400 mt-2 text-sm">{metricsError}</p>}
                    </div>

                    {metricsData && (
                        <div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                    <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Total Invocations (Recent)</h4>
                                    <p className="text-2xl font-bold text-white">{metricsData.length}</p>
                                </div>
                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                    <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Average Latency</h4>
                                    <p className="text-2xl font-bold text-white">
                                        {metricsData.length > 0
                                            ? `${Math.round(metricsData.reduce((acc, curr) => acc + (parseInt(curr.latency_ms) || 0), 0) / metricsData.length)} ms`
                                            : 'N/A'}
                                    </p>
                                </div>
                            </div>

                            <div className="overflow-x-auto bg-gray-900/50 rounded-lg border border-gray-700">
                                <table className="min-w-full divide-y divide-gray-700">
                                    <thead className="bg-gray-800 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3">Timestamp</th>
                                            <th className="px-4 py-3">Latency (ms)</th>
                                            <th className="px-4 py-3">User Prompt</th>
                                            <th className="px-4 py-3">Response Snippet</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700 text-sm p-4">
                                        {metricsData.length > 0 ? (
                                            metricsData.map((row, index) => (
                                                <tr key={index} className="hover:bg-gray-800 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap text-gray-300 font-mono text-xs">
                                                        {row.timestamp && row.timestamp.value ? new Date(row.timestamp.value).toLocaleString() : 'N/A'}
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-gray-300 font-mono text-xs">{row.latency_ms}</td>
                                                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate" title={row.user_input}>{row.user_input}</td>
                                                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate" title={row.assistant_response}>{row.assistant_response}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-4 text-center text-gray-500 italic">No logs found for this agent in the specified BigQuery table.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {iamPolicy && (
                 <SetIamPolicyModal
                    isOpen={isSetPolicyModalOpen}
                    onClose={() => setIsSetPolicyModalOpen(false)}
                    onSuccess={handleSetPolicySuccess}
                    agent={agent}
                    config={config}
                    currentPolicy={iamPolicy}
                />
            )}
        </div>
    );
};

export default AgentDetails;
