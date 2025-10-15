import React from 'react';
import { Agent, SortableAgentKey, SortConfig } from '../../types';

interface AgentListProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  onEditAgent: (agent: Agent) => void;
  onDeleteAgent: (agent: Agent) => void;
  onRegisterNew: () => void;
  onToggleAgentStatus: (agent: Agent) => void;
  togglingAgentId?: string | null;
  deletingAgentId?: string | null;
  onSort: (key: SortableAgentKey) => void;
  sortConfig: SortConfig;
}

const SortIcon: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => {
  const path = direction === 'asc'
    ? "M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
    : "M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
};

const AgentList: React.FC<AgentListProps> = ({ agents, onSelectAgent, onEditAgent, onDeleteAgent, onRegisterNew, onToggleAgentStatus, togglingAgentId, deletingAgentId, onSort, sortConfig }) => {

  const SortableHeader: React.FC<{ sortKey: SortableAgentKey; children: React.ReactNode; className?: string }> = ({ sortKey, children, className = '' }) => {
    const isSorted = sortConfig?.key === sortKey;
    return (
      <th scope="col" className={`px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${className}`}>
        <button onClick={() => onSort(sortKey)} className="flex items-center space-x-1 group focus:outline-none">
          <span className="group-hover:text-white transition-colors">{children}</span>
          <div className="w-4 h-4">
            {isSorted && <SortIcon direction={sortConfig.direction} />}
          </div>
        </button>
      </th>
    );
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Registered Agents</h2>
        <button
          onClick={onRegisterNew}
          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
        >
          Register New Agent
        </button>
      </div>
      {agents.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No agents found for the provided configuration.</p>
      ) : (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700/50">
                    <tr>
                        <SortableHeader sortKey="displayName">Display Name</SortableHeader>
                        <SortableHeader sortKey="state">Status</SortableHeader>
                        <SortableHeader sortKey="name">Agent ID</SortableHeader>
                        <SortableHeader sortKey="updateTime">Last Modified</SortableHeader>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {agents.map((agent) => {
                        const agentId = agent.name.split('/').pop() || '';
                        const isToggling = togglingAgentId === agentId;
                        const isDeleting = deletingAgentId === agentId;
                        const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';

                        let statusButton = null;
                        if (agent.state === 'ENABLED' || agent.state === 'DISABLED') {
                            const isEnabled = agent.state === 'ENABLED';
                            const statusProps = {
                                text: isEnabled ? 'Enabled' : 'Disabled',
                                colorClasses: isEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
                            };
                            statusButton = (
                                isToggling ? (
                                    <div className="flex items-center space-x-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-400"></div>
                                        <span className="text-xs text-gray-400">Updating...</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => onToggleAgentStatus(agent)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${statusProps.colorClasses}`}
                                        disabled={isToggling || isDeleting}
                                    >
                                        {statusProps.text}
                                    </button>
                                )
                            );
                        } else {
                            statusButton = <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-black">Private</span>
                        }

                        return (
                            <tr key={agent.name} className="hover:bg-gray-700/50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center">
                                    <span className={`h-2.5 w-2.5 rounded-full mr-3 shrink-0 ${statusColorClass}`}></span>
                                    {agent.displayName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {statusButton}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{agentId}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {agent.updateTime ? new Date(agent.updateTime).toLocaleString() : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                    {isDeleting ? (
                                        <span className="text-xs text-gray-400 italic">Deleting...</span>
                                    ) : (
                                        <>
                                            <button onClick={() => onSelectAgent(agent)} disabled={isToggling} className="font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500">
                                                View
                                            </button>
                                            {(agent.state === 'ENABLED' || agent.state === 'DISABLED') && (
                                                <button 
                                                    onClick={() => onEditAgent(agent)} 
                                                    disabled={isToggling} 
                                                    className="font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-gray-500"
                                                    title="Edit Agent"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            <button onClick={() => onDeleteAgent(agent)} disabled={isToggling} className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500">
                                                Delete
                                            </button>
                                        </>
                                    )}
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

export default AgentList;