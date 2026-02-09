import React, { useState, useEffect } from 'react';
import { GitHubService } from '../../services/gitHubService';

interface GitHubSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (repo: { name: string; full_name: string; html_url: string }) => void;
    token: string | null;
    setToken: (token: string) => void;
}

const GitHubSelectModal: React.FC<GitHubSelectModalProps> = ({ isOpen, onClose, onSelect, token, setToken }) => {
    const [repositories, setRepositories] = useState<{ name: string; full_name: string; html_url: string; private: boolean; updated_at: string | null }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isTokenVerified, setIsTokenVerified] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setStatus('');
            setIsLoading(false);
            setRepositories([]);
            setIsTokenVerified(!!token); // Assume verified if token exists for now, or re-verify
            if (token) {
                fetchRepositories(token);
            }
        }
    }, [isOpen]);

    const fetchRepositories = async (authToken: string) => {
        setIsLoading(true);
        setStatus('Fetching repositories...');
        setError(null);
        try {
            const gh = new GitHubService(authToken);
            // Verify first if we haven't confirmed it recently? 
            // Actually listForAuthenticatedUser implicitly verifies it.
            const repos = await gh.getUserRepositories(1, 100); // Fetch first 100
            setRepositories(repos);
            setIsTokenVerified(true);
            setStatus('');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to fetch repositories.');
            setIsTokenVerified(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = () => {
        if (!token) {
            setError('Personal Access Token is required.');
            return;
        }
        fetchRepositories(token);
    };

    const filteredRepos = repositories.filter(repo => 
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-2xl p-6 relative flex flex-col max-h-[90vh]">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <svg className="w-6 h-6 text-teal-400" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.604 9.604 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    Select GitHub Repository
                </h2>
                <p className="text-gray-400 text-sm mb-6">
                    Connect your existing repository to push the agent starter pack code.
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm flex items-center gap-2">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* Token Input Section */}
                {!isTokenVerified && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Personal Access Token (PAT)
                            </label>
                            <input
                                type="password"
                                value={token || ''}
                                onChange={(e) => setToken(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:ring-teal-500"
                                placeholder="ghp_..."
                            />
                            <p className="text-xs text-gray-500 mt-1">Token requires <code>repo</code> scope.</p>
                        </div>
                        <button
                            onClick={handleConnect}
                            disabled={isLoading || !token}
                            className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Connecting...' : 'Connect to GitHub'}
                        </button>
                    </div>
                )}

                {/* Repository List Section */}
                {isTokenVerified && (
                    <div className="flex flex-col flex-1 min-h-0">
                         <div className="flex justify-between items-center mb-4 gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search repositories..."
                                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 pl-9 text-white focus:ring-teal-500 text-sm"
                                />
                                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                             <button
                                onClick={() => {
                                    setToken('');
                                    setIsTokenVerified(false);
                                    setRepositories([]);
                                }}
                                className="text-xs text-teal-400 hover:text-teal-300 underline whitespace-nowrap"
                            >
                                Change Token
                            </button>
                        </div>

                        {isLoading ? (
                             <div className="flex-1 flex items-center justify-center p-8">
                                <div className="animate-spin h-8 w-8 border-2 border-teal-500 border-t-transparent rounded-full"></div>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {filteredRepos.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">
                                        No repositories found matching your search.
                                    </div>
                                ) : (
                                    filteredRepos.map((repo) => (
                                        <button
                                            key={repo.full_name}
                                            onClick={() => onSelect(repo)}
                                            className="w-full text-left p-3 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded flex justify-between items-center group transition-colors"
                                        >
                                            <div>
                                                <div className="font-medium text-white group-hover:text-teal-300 transition-colors">
                                                    {repo.name}
                                                </div>
                                                 <div className="text-xs text-gray-400 flex items-center gap-2">
                                                    {repo.private ? (
                                                        <span className="flex items-center gap-1 text-yellow-500/80">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                            Private
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-gray-500">
                                                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                            Public
                                                        </span>
                                                    )}
                                                    <span>•</span>
                                                    <span>Updated {repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : 'Unknown'}</span>
                                                </div>
                                            </div>
                                            <svg className="w-5 h-5 text-gray-500 group-hover:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GitHubSelectModal;
