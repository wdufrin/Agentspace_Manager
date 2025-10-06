

import React, { useState } from 'react';
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';

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
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [agentViewData, setAgentViewData] = useState<any | null>(null);
    const [isFetchingView, setIsFetchingView] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);

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

    const reasoningEngine = agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
    const toolDescription = agent.adkAgentDefinition?.toolSettings?.toolDescription;
    
    let statusElement = null;
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
        statusElement = (
            <div className="py-2">
                <dt className="text-sm font-medium text-gray-400">Status</dt>
                <dd className="mt-1 text-sm">
                     <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-black">Private</span>
                </dd>
            </div>
        );
    }

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

            <dl className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="Full Resource Name" value={agent.name} />
                <DetailItem label="Agent ID" value={agentId} />
                {statusElement}
                {reasoningEngine && <DetailItem label="Reasoning Engine" value={reasoningEngine} />}
                {toolDescription && <DetailItem label="Tool Description" value={toolDescription} />}
                <DetailItem label="Authorizations" value={agent.authorizations?.join(', ')} />
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


            <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-700 pt-6">
                {(agent.state === 'ENABLED' || agent.state === 'DISABLED') && (
                    <button 
                        onClick={onEdit} 
                        title="Update Agent"
                        className="px-5 py-2.5 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
                    >
                        Update
                    </button>
                )}
                <button onClick={handleDelete} disabled={isDeleting} className="px-5 py-2.5 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800">
                    {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
                <button onClick={handleFetchAgentView} disabled={isFetchingView} className="px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-md hover:bg-teal-700 disabled:bg-teal-800">
                    {isFetchingView ? 'Fetching...' : 'Get View'}
                 </button>
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
        </div>
    );
};

export default AgentDetails;