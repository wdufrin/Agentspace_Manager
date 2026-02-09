import React, { useState } from 'react';
import { Template } from '../../pages/AgentStarterPackPage';
import GitHubCreateModal from './GitHubCreateModal';
import GitHubSelectModal from './GitHubSelectModal';
import { GitHubService } from '../../services/gitHubService';

interface StepDeployProps {
    template: Template;
    agentName: string;
    projectId: string;
    model: string;
    advancedOptions: {
        includeFrontend: boolean;
        enableAnalytics: boolean;
        enableRedis: boolean;
        gcsBucket: string;
        dataStoreId: string;
    };
    cliCommand: string;
    onCopyCommand: () => void;
    onDeploy: () => void;
    isDeploying: boolean;
    files: { path: string; content: string }[]; // Needed for GitHub Push
}

const StepDeploy: React.FC<StepDeployProps> = ({
    template, agentName, projectId, model, advancedOptions,
    cliCommand, onCopyCommand, onDeploy, isDeploying, files
}) => {
    const [copied, setCopied] = useState(false);
    const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
    const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

    // In a real app, this token should be managed more securely or asked every time
    // For this demo, we'll keep it in local state of the modal or parent
    const [ghToken, setGhToken] = useState<string | null>(null);
    const [repoUrl, setRepoUrl] = useState<string | null>(null);
    const [selectedRepo, setSelectedRepo] = useState<{ name: string; full_name: string; html_url: string } | null>(null);
    const [isPushing, setIsPushing] = useState(false);
    const [pushError, setPushError] = useState<string | null>(null);

    const handleCopy = () => {
        onCopyCommand();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSelectRepo = async (repo: { name: string; full_name: string; html_url: string }) => {
        setSelectedRepo(repo);
        setIsSelectModalOpen(false);
        setRepoUrl(repo.html_url); // Optimistically set, but maybe wait for push

        // Auto-push to selected repo? Or show a "Push to <repo>" button?
        // Let's auto-push for smoother UX, but showing a confirmation or specific button state is better.
        // For simplicity, let's trigger the push immediately with a specialized function.
        await pushToExistingRepo(repo, ghToken!);
    };

    const pushToExistingRepo = async (repo: { name: string; full_name: string; html_url: string }, token: string) => {
        setIsPushing(true);
        setPushError(null);
        try {
            const gh = new GitHubService(token);
            const [owner, repoName] = repo.full_name.split('/');

            // We assume 'main' branch exists, but should ideally check using the data we might have or default to main.
            // If it fails, maybe try 'master'? Or just fail.
            await gh.pushFilesToRepository(owner, repoName, 'main', files, 'Update from Agent Starter Pack');

            setRepoUrl(repo.html_url);
            alert(`Successfully pushed to ${repo.full_name}!`);
        } catch (error: any) {
            console.error('Push failed:', error);
            setPushError(error.message || 'Failed to push to repository.');
            // Logic to maybe prompt for creating branch if missing? 
            // For now just show error.
        } finally {
            setIsPushing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Col: Review */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h3 className="text-lg font-semibold text-white mb-4">Review Configuration</h3>

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                            <div className="col-span-1">
                                <dt className="text-gray-500">Template</dt>
                                <dd className="text-white font-medium flex items-center gap-2">
                                    <span className="text-teal-400">{template.icon}</span> {template.name}
                                </dd>
                            </div>
                            <div className="col-span-1">
                                <dt className="text-gray-500">Agent Name</dt>
                                <dd className="text-white font-medium">{agentName}</dd>
                            </div>
                            <div className="col-span-1">
                                <dt className="text-gray-500">Project ID</dt>
                                <dd className="text-white font-medium">{projectId}</dd>
                            </div>
                            <div className="col-span-1">
                                <dt className="text-gray-500">Model</dt>
                                <dd className="text-white font-medium">{model}</dd>
                            </div>
                        </dl>

                        {(advancedOptions.includeFrontend || advancedOptions.enableAnalytics || advancedOptions.enableRedis || advancedOptions.gcsBucket || advancedOptions.dataStoreId) && (
                            <div className="mt-4 pt-4 border-t border-gray-700">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Enabled Extensions & Config</h4>
                                <ul className="list-disc list-inside text-sm text-teal-300">
                                    {advancedOptions.includeFrontend && <li>Frontend UI</li>}
                                    {advancedOptions.enableAnalytics && <li>Analytics (BigQuery)</li>}
                                    {advancedOptions.enableRedis && <li>Redis Memory</li>}
                                    {advancedOptions.gcsBucket && <li>GCS: <span className="text-gray-300 font-mono text-xs">{advancedOptions.gcsBucket}</span></li>}
                                    {advancedOptions.dataStoreId && <li>Data Store: <span className="text-gray-300 font-mono text-xs">{advancedOptions.dataStoreId}</span></li>}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Deployment Actions */}
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 space-y-4">
                        <h3 className="text-lg font-semibold text-white">Deploy & Create</h3>

                        {/* 1. CLI */}
                        <div className="bg-black/50 p-4 rounded-md border border-gray-700 font-mono text-xs text-gray-300 overflow-x-auto relative group">
                            <pre>{cliCommand}</pre>
                            <button
                                onClick={handleCopy}
                                className="absolute top-2 right-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4">
                            {/* GitHub Action Group */}
                            <div className="col-span-2 md:col-span-1 flex flex-col gap-2">
                                <button
                                    onClick={() => setIsGitHubModalOpen(true)}
                                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 border border-gray-600"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.604 9.604 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                                    </svg>
                                    Create New Repo
                                </button>
                                <button
                                    onClick={() => setIsSelectModalOpen(true)}
                                    className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm border border-gray-600 dashed border-dashed"
                                >
                                    Select Existing Repo...
                                </button>
                            </div>

                            {/* Cloud Build Action */}
                            <button
                                onClick={onDeploy}
                                disabled={isDeploying}
                                className="col-span-2 md:col-span-1 w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed h-full"
                            >
                                {isDeploying ? (
                                    <>
                                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                                        Deploying...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                        Deploy to GCP
                                    </>
                                )}
                            </button>
                        </div>

                        {pushError && (
                            <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
                                <strong>Push Failed:</strong> {pushError}
                            </div>
                        )}

                        {(repoUrl || isPushing) && (
                            <div className="mt-4 p-4 bg-teal-900/30 border border-teal-800 rounded-lg flex justify-between items-center">
                                {isPushing ? (
                                    <div className="flex items-center gap-2 text-teal-300 text-sm">
                                        <div className="animate-spin h-4 w-4 border-2 border-teal-500 border-t-transparent rounded-full"></div>
                                        Pushing to {selectedRepo?.full_name || 'repository'}...
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-teal-300 text-sm">Valid Repository Connected</span>
                                        <a href={repoUrl!} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline text-sm font-semibold">View on GitHub &rarr;</a>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Col: Infrastructure Preview */}
                <div className="lg:col-span-1">
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 h-full">
                        <h3 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-1.5 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" clipRule="evenodd" />
                            </svg>
                            Infrastructure Preview
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">
                            This deployment will provision the following resources via Terraform:
                        </p>
                        <ul className="space-y-2">
                            {template.resources.map((res, idx) => (
                                <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-teal-500 mt-1">•</span>
                                    {res}
                                </li>
                            ))}
                            {/* Dynamic Resources */}
                            {advancedOptions.includeFrontend && (
                                <li className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-teal-500 mt-1">•</span> Cloud Storage (Frontend Hosting)
                                </li>
                            )}
                            {advancedOptions.includeFrontend && (
                                <li className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-teal-500 mt-1">•</span> Load Balancer (Optional)
                                </li>
                            )}
                            {advancedOptions.enableAnalytics && (
                                <li className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-teal-500 mt-1">•</span> BigQuery Dataset
                                </li>
                            )}
                            {advancedOptions.enableRedis && (
                                <li className="text-sm text-gray-300 flex items-start gap-2">
                                    <span className="text-teal-500 mt-1">•</span> Cloud Redis Instance
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            {/* GitHub Create Modal */}
            <GitHubCreateModal
                isOpen={isGitHubModalOpen}
                onClose={() => setIsGitHubModalOpen(false)}
                onSuccess={(url) => setRepoUrl(url)}
                token={ghToken}
                setToken={setGhToken}
                files={files}
            />

            {/* GitHub Select Modal */}
            <GitHubSelectModal
                isOpen={isSelectModalOpen}
                onClose={() => setIsSelectModalOpen(false)}
                onSelect={handleSelectRepo}
                token={ghToken}
                setToken={setGhToken}
            />
        </div>
    );
};

export default StepDeploy;
