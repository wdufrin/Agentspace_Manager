

import React from 'react';
import { Agent, ReasoningEngine } from '../../types';

interface EngineDetailsProps {
    engine: ReasoningEngine;
    usingAgents: Agent[];
    onBack: () => void;
}

const DetailItem: React.FC<{ label: string; value: string | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded">{value || 'Not set'}</dd>
    </div>
);

const EngineDetails: React.FC<EngineDetailsProps> = ({ engine, usingAgents, onBack }) => {
    const engineId = engine.name.split('/').pop() || '';

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        {engine.displayName}
                    </h2>
                    <p className="text-gray-400 mt-1 font-mono">{engineId}</p>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back to list</button>
            </div>

            <dl className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 gap-x-4 gap-y-2">
                <DetailItem label="Full Resource Name" value={engine.name} />
                <DetailItem label="Location" value={engine.name.split('/')[3]} />
            </dl>
            
            <div className="mt-6 border-t border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-white">Agents Using This Engine ({usingAgents.length})</h3>
                {usingAgents.length > 0 ? (
                    <ul className="mt-2 space-y-2 bg-gray-900/50 p-3 rounded-md">
                        {usingAgents.map((agent) => {
                            const agentEngineId = agent.name.split('/')[7];
                            return (
                                <li key={agent.name} className="p-2 rounded-md hover:bg-gray-700/50">
                                    <span className="font-medium text-white">{agentEngineId}/{agent.displayName}</span>
                                    <p className="text-gray-400 font-mono text-xs" title={agent.name}>
                                        ID: {agent.name.split('/').pop()}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="mt-2 text-sm text-gray-400 italic">No agents are currently using this engine.</p>
                )}
            </div>
        </div>
    );
};

export default EngineDetails;