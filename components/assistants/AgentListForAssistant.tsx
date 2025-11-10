import React from 'react';
import { Agent } from '../../types';

interface AgentListForAssistantProps {
  agents: Agent[];
}

const AgentListForAssistant: React.FC<AgentListForAssistantProps> = ({ agents }) => {
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Registered Agents ({agents.length})</h2>
      </div>
      {agents.length === 0 ? (
        <p className="text-gray-400 p-6 text-center flex-1">No agents found for this assistant.</p>
      ) : (
        <div className="overflow-y-auto flex-1">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50 sticky top-0">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Agent ID</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {agents.map((agent) => {
                const agentId = agent.name.split('/').pop() || '';
                const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';
                const statusText = agent.state ? agent.state.charAt(0) + agent.state.slice(1).toLowerCase() : 'Private';

                return (
                  <tr key={agent.name} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center">
                        <span className={`h-2.5 w-2.5 rounded-full mr-3 shrink-0 ${statusColorClass}`}></span>
                        {agent.displayName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColorClass} ${statusText === 'Private' ? 'text-black' : 'text-white'}`}>
                            {statusText}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{agentId}</td>
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

export default AgentListForAssistant;