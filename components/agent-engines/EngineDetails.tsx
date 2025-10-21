import React, { useState } from 'react';
import { Agent, ReasoningEngine, Config } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import ConfirmationModal from '../ConfirmationModal';

interface EngineDetailsProps {
    engine: ReasoningEngine;
    usingAgents: Agent[];
    onBack: () => void;
    config: Config;
}

const DetailItem: React.FC<{ label: string; value: string | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded">{value || 'Not set'}</dd>
    </div>
);

const EngineDetails: React.FC<EngineDetailsProps> = ({ engine, usingAgents, onBack, config }) => {
    const engineId = engine.name.split('/').pop() || '';
    
    const [sessions, setSessions] = useState<{ name: string }[] | null>(null);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [sessionsError, setSessionsError] = useState<string | null>(null);

    // State for deleting sessions
    const [deletingSessionName, setDeletingSessionName] = useState<string | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState<{ name: string } | null>(null);

    const handleFetchSessions = async () => {
        setIsLoadingSessions(true);
        setSessionsError(null);
        setSessions(null);
        try {
            const response = await api.listReasoningEngineSessions(engine.name, config);
            setSessions(response.sessions || []);
        } catch (err: any) {
            setSessionsError(err.message || 'Failed to fetch active sessions.');
        } finally {
            setIsLoadingSessions(false);
        }
    };

    const handleRequestDelete = (session: { name: string }) => {
        setSessionToDelete(session);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!sessionToDelete) return;

        setDeletingSessionName(sessionToDelete.name);
        setIsDeleteModalOpen(false);
        setSessionsError(null);

        try {
            await api.deleteReasoningEngineSession(sessionToDelete.name, config);
            // Refresh the list automatically after deletion
            await handleFetchSessions();
        } catch (err: any) {
            setSessionsError(err.message || `Failed to delete session ${sessionToDelete.name.split('/').pop()}`);
        } finally {
            setDeletingSessionName(null);
            setSessionToDelete(null);
        }
    };


    return (
        <>
            {sessionToDelete && (
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={handleConfirmDelete}
                    title="Confirm Session Deletion"
                    confirmText="Delete"
                    isConfirming={!!deletingSessionName}
                >
                    <p>Are you sure you want to permanently delete this active session?</p>
                    <div className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600">
                        <p className="text-xs font-mono text-gray-400">{sessionToDelete.name.split('/').pop()}</p>
                    </div>
                    <p className="mt-4 text-sm text-yellow-300">This action will terminate the session and may interrupt an ongoing conversation.</p>
                </ConfirmationModal>
            )}

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
                
                <div className="mt-4 border-b border-gray-700">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <span
                            className={'whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm border-blue-500 text-blue-400'}
                        >
                            Details
                        </span>
                    </nav>
                </div>
                
                <dl className="mt-6 pt-6 grid grid-cols-1 gap-x-4 gap-y-2">
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
                
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Active Sessions</h3>
                    <p className="text-sm text-gray-400 mt-1 mb-4">View and terminate sessions currently active for this engine.</p>
                    <button
                        onClick={handleFetchSessions}
                        disabled={isLoadingSessions}
                        className="px-5 py-2.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-cyan-800"
                    >
                        {isLoadingSessions ? 'Fetching...' : 'View Active Sessions'}
                    </button>

                    <div className="mt-4">
                        {isLoadingSessions && <Spinner />}
                        {sessionsError && <p className="text-red-400 mt-2">{sessionsError}</p>}
                        {sessions !== null && (
                            <>
                                <p className="text-sm text-gray-300 mb-2">Found {sessions.length} active session(s).</p>
                                {sessions.length > 0 && (
                                    <div className="bg-gray-900/50 rounded-lg border border-gray-700 max-h-48 overflow-y-auto">
                                        <ul className="divide-y divide-gray-700">
                                            {sessions.map(session => {
                                                const isDeletingThis = deletingSessionName === session.name;
                                                return (
                                                    <li key={session.name} className="p-3 flex justify-between items-center">
                                                        <span className="text-xs font-mono text-gray-400 truncate" title={session.name}>
                                                            {session.name.split('/').pop()}
                                                        </span>
                                                        <button
                                                            onClick={() => handleRequestDelete(session)}
                                                            disabled={!!deletingSessionName}
                                                            className="text-red-500 hover:text-red-400 text-xs font-semibold disabled:text-gray-500 disabled:cursor-not-allowed shrink-0 ml-4"
                                                        >
                                                            {isDeletingThis ? 'Deleting...' : 'Delete'}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

            </div>
        </>
    );
};

export default EngineDetails;