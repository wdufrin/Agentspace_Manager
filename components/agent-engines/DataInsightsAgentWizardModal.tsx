import React, { useState, useEffect } from 'react';
import * as api from '../../services/apiService';

interface WizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialProjectId?: string;
    onAgentCreated?: () => void;
}

const DataInsightsAgentWizardModal: React.FC<WizardModalProps> = ({ isOpen, onClose, initialProjectId = '', onAgentCreated }) => {
    const [step, setStep] = useState(1);

    // Step 1: Authorization
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');

    // Step 2: Agent & BigQuery Details
    const [agentName, setAgentName] = useState('');
    const [agentDescription, setAgentDescription] = useState('');
    const [projectId, setProjectId] = useState(initialProjectId);
    const [appLocation, setAppLocation] = useState('global');
    // Target Engine Fetching State
    const [appId, setAppId] = useState('');
    const [engines, setEngines] = useState<any[]>([]);
    const [isLoadingEngines, setIsLoadingEngines] = useState(false);

    // Dataset Fetching State
    const [bqDataset, setBqDataset] = useState('');
    const [datasets, setDatasets] = useState<any[]>([]);
    const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
    const [datasetError, setDatasetError] = useState<string | null>(null);

    // Step 3: Advanced Config
    const [schemaDescription, setSchemaDescription] = useState('');
    const [nlqPrompt, setNlqPrompt] = useState('');

    // Deployment Status State
    const [deployStatus, setDeployStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [deployError, setDeployError] = useState<string | null>(null);

    // Reset state and fetch initial datasets when modal opens
    useEffect(() => {
        if (isOpen && initialProjectId && !projectId) {
            setProjectId(initialProjectId);
        }
    }, [isOpen, initialProjectId]);

    // Fetch Engines when projectId or appLocation changes
    useEffect(() => {
        if (!projectId || !isOpen) return;

        const fetchEngines = async () => {
            setIsLoadingEngines(true);
            try {
                const config = { projectId, appLocation, collectionId: 'default_collection', appId: '', assistantId: '' };
                const response = await api.listResources('engines', config);
                const fetchedEngines = response.engines || [];
                setEngines(fetchedEngines);
                
                // Auto-select the first engine if none is selected
                if (fetchedEngines.length > 0 && (!appId || appId === 'default_engine')) {
                    setAppId(fetchedEngines[0].name.split('/').pop() || '');
                }
            } catch (err) {
                console.error("Failed to fetch engines:", err);
                setEngines([]);
            } finally {
                setIsLoadingEngines(false);
            }
        };

        fetchEngines();
    }, [projectId, appLocation, isOpen]);

    // Fetch datasets when projectId changes
    useEffect(() => {
        if (!projectId || !isOpen) return;

        const fetchDatasets = async () => {
            setIsLoadingDatasets(true);
            setDatasetError(null);
            try {
                const response = await api.listBigQueryDatasets(projectId);
                // The existing API might return { datasets: [...] } or just [...] depending on implementation
                const fetchedDatasets = Array.isArray(response) ? response : (response?.datasets || []);
                setDatasets(fetchedDatasets);
            } catch (err: any) {
                setDatasetError(err.message || 'Failed to fetch datasets. Check Project ID.');
                setDatasets([]);
            } finally {
                setIsLoadingDatasets(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchDatasets();
        }, 500); // debounce 500ms

        return () => clearTimeout(timeoutId);
    }, [projectId, isOpen]);

    if (!isOpen) return null;

    const isNextDisabled = () => {
        if (step === 1) return !clientId.trim() || !clientSecret.trim();
        if (step === 2) return !agentName.trim() || !appId.trim() || !bqDataset.trim();
        return false;
    };

    const handleNext = () => setStep(s => Math.min(s + 1, 4));
    const handlePrev = () => setStep(s => Math.max(s - 1, 1));

    const handleDeploy = async () => {
        setDeployStatus('loading');
        setDeployError(null);

        try {
            // 1. Set up API Config.
            const config = {
                projectId: projectId,
                appLocation: appLocation, 
                collectionId: 'default_collection',
                appId: appId, 
                assistantId: 'default_assistant'
            };

            // 2. Create the Authorization Resource (Step 1 in docs)
            const authId = `bq-auth-${Date.now()}`;
            const authPayload = {
                name: `projects/${projectId}/locations/${appLocation}/authorizations/${authId}`,
                serverSideOauth2: {
                    clientId: clientId,
                    clientSecret: clientSecret,
                    authorizationUri: `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=https://vertexaisearch.cloud.google.com/oauth-redirect&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform&response_type=code&access_type=offline&prompt=consent`,
                    tokenUri: "https://oauth2.googleapis.com/token"
                }
            };
            const authUrl = `https://${appLocation === 'global' ? '' : appLocation + '-'}discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${appLocation}/authorizations?authorizationId=${authId}`;
            await api.gapiRequest(authUrl, 'POST', projectId, undefined, authPayload);

            // 3. Construct the Data Insights Agent Payload (Step 2 in docs)
            const agentPayload = {
                displayName: agentName || 'Data Insights Agent',
                description: agentDescription || 'Data insights agent for querying BigQuery data.',
                managedAgentDefinition: {
                    toolSettings: {
                        toolDescription: "Data insights agent"
                    },
                    dataScienceAgentConfig: {
                        bqProjectId: projectId,
                        bqDatasetId: bqDataset,
                        nlQueryConfig: {
                            schemaDescription: schemaDescription,
                            nl2sqlPrompt: nlqPrompt
                        }
                    }
                },
                authorizationConfig: {
                    toolAuthorizations: [
                        `projects/${projectId}/locations/${appLocation}/authorizations/${authId}`
                    ]
                }
            };

            // 3. Make the API call to create the agent
            await api.createAgent(agentPayload, config);

            setDeployStatus('success');
            
            // 4. Refresh the parent table
            if (onAgentCreated) {
                onAgentCreated();
            }

        } catch (err: any) {
            setDeployStatus('error');
            setDeployError(err.message || 'An unknown error occurred during deployment.');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-full max-w-3xl flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-lg">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Create Data Insights Agent
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Deploy a natural language agent to query your BigQuery datasets.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Wizard Steps Indicator */}
                <div className="px-6 pt-6">
                    <div className="flex items-center">
                        {[1, 2, 3, 4].map(num => (
                            <React.Fragment key={num}>
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-bold transition-colors
                                    ${step >= num ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-500'}`}>
                                    {step > num ? '✓' : num}
                                </div>
                                {num < 4 && (
                                    <div className={`flex-1 h-1 mx-2 rounded transition-colors ${step > num ? 'bg-blue-600' : 'bg-gray-700'}`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-500 px-1">
                        <span>Authorization</span>
                        <span className="ml-2">Configuration</span>
                        <span className="ml-3">Advanced</span>
                        <span>Review</span>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {step === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white mb-4">Step 1: OAuth Authorization</h3>
                            <div className="bg-blue-900/30 border border-blue-800 p-4 rounded-md">
                                <p className="text-sm text-blue-200">
                                    You need to authorize the Data Insights agent to connect to your BigQuery data. 
                                    Enter the credentials from the OAuth Client ID created in your Google Cloud console.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Client ID</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                    value={clientId}
                                    onChange={e => setClientId(e.target.value)}
                                    placeholder="e.g. 123456789-xyz.apps.googleusercontent.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Client Secret</label>
                                <input 
                                    type="password" 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                    value={clientSecret}
                                    onChange={e => setClientSecret(e.target.value)}
                                    placeholder="Your OAuth Client Secret"
                                />
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white mb-4">Step 2: Agent Details & Data Source</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Agent Name</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                    value={agentName}
                                    onChange={e => setAgentName(e.target.value)}
                                    placeholder="e.g. Sales Analytics Agent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Description (Optional)</label>
                                <textarea 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                    value={agentDescription}
                                    onChange={e => setAgentDescription(e.target.value)}
                                    placeholder="Help users understand this agent's purpose..."
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Project ID</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white font-mono focus:ring-blue-500 focus:border-blue-500"
                                        value={projectId}
                                        onChange={e => setProjectId(e.target.value)}
                                        placeholder="e.g. my-project-id"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
                                    <select 
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                        value={appLocation}
                                        onChange={e => setAppLocation(e.target.value)}
                                    >
                                        <option value="global">global</option>
                                        <option value="us">us</option>
                                        <option value="eu">eu</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Target App ID</label>
                                    <div className="relative">
                                        <select 
                                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                                            value={appId}
                                            onChange={e => setAppId(e.target.value)}
                                            disabled={isLoadingEngines || engines.length === 0}
                                        >
                                            <option value="">{isLoadingEngines ? 'Loading engines...' : 'Select an app engine...'}</option>
                                            {engines.map(engine => {
                                                const shortId = engine.name.split('/').pop();
                                                return (
                                                    <option key={shortId} value={shortId}>
                                                        {engine.displayName || shortId} ({shortId})
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">BigQuery Dataset</label>
                                <div className="relative">
                                        <select 
                                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                                            value={bqDataset}
                                            onChange={e => setBqDataset(e.target.value)}
                                            disabled={isLoadingDatasets || datasets.length === 0}
                                        >
                                            <option value="">{isLoadingDatasets ? 'Loading datasets...' : 'Select a dataset...'}</option>
                                            {datasets.map(d => (
                                                <option key={d.id} value={d.datasetReference.datasetId}>
                                                    {d.datasetReference.datasetId}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                        </div>
                                    </div>
                                    {datasetError && <p className="text-xs text-red-400 mt-1">{datasetError}</p>}
                                </div>
                            </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white mb-4">Step 3: Natural Language Configuration (Advanced)</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Schema Description</label>
                                <textarea 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                    value={schemaDescription}
                                    onChange={e => setSchemaDescription(e.target.value)}
                                    placeholder="Describe your tables, e.g. 'The sales_data table tracks daily revenue by region...'"
                                    rows={4}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Natural Language to SQL Prompt</label>
                                <textarea 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                                    value={nlqPrompt}
                                    onChange={e => setNlqPrompt(e.target.value)}
                                    placeholder="Custom instructions for how the model should generate SQL..."
                                    rows={4}
                                />
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Step 4: Review & Deploy</h3>
                            
                            {deployStatus === 'success' ? (
                                <div className="bg-green-900/30 border border-green-800 p-8 rounded-md text-center">
                                    <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-xl font-bold text-green-100 mb-2">Agent Deployed Successfully!</p>
                                    <p className="text-sm text-green-200">
                                        Your Data Insights agent <strong>{agentName || 'Data Insights Agent'}</strong> is now live and connected to your BigQuery dataset.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-gray-700 rounded-md p-4 space-y-3">
                                        <div className="grid grid-cols-3 gap-4">
                                            <span className="text-gray-400 text-sm">Agent Name:</span>
                                            <span className="col-span-2 text-white font-medium">{agentName || '(Not provided)'}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <span className="text-gray-400 text-sm">BigQuery Dataset:</span>
                                            <span className="col-span-2 text-white font-mono text-sm">{bqDataset || '(Not provided)'}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <span className="text-gray-400 text-sm">Client ID:</span>
                                            <span className="col-span-2 text-white font-mono text-sm truncate">{clientId || '(Not provided)'}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <span className="text-gray-400 text-sm">NLQ Configured:</span>
                                            <span className="col-span-2 text-white">{schemaDescription || nlqPrompt ? 'Yes' : 'No'}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-yellow-900/30 border border-yellow-800 p-4 rounded-md flex gap-3 items-start">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                        <div className="text-sm text-yellow-200">
                                            <p className="font-bold mb-1">Ensure IAM Roles Are Granted</p>
                                            The users of this agent must have the following BigQuery roles: 
                                            <span className="font-mono text-xs mx-1 bg-yellow-950 px-1 rounded">bigquery.dataViewer</span>, 
                                            <span className="font-mono text-xs mx-1 bg-yellow-950 px-1 rounded">bigquery.jobUser</span>, and
                                            <span className="font-mono text-xs mx-1 bg-yellow-950 px-1 rounded">bigquery.metadataViewer</span>.
                                        </div>
                                    </div>

                                    {deployStatus === 'error' && (
                                        <div className="bg-red-900/30 border border-red-800 p-4 rounded-md flex gap-3 items-start animate-pulse">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                            </svg>
                                            <div className="text-sm text-red-200">
                                                <p className="font-bold mb-1">Deployment Failed</p>
                                                {deployError}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 bg-gray-800 rounded-b-lg flex justify-between items-center">
                    {deployStatus === 'success' ? (
                        <div className="w-full flex justify-end">
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={handlePrev}
                                disabled={step === 1 || deployStatus === 'loading'}
                                className="px-4 py-2 bg-gray-700 text-gray-300 text-sm font-semibold rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Back
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    disabled={deployStatus === 'loading'}
                                    className="px-4 py-2 bg-transparent text-gray-400 text-sm font-semibold hover:text-white disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                        {step < 4 ? (
                            <button
                                onClick={handleNext}
                                disabled={isNextDisabled()}
                                className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        ) : (
                            <button
                                onClick={handleDeploy}
                                disabled={deployStatus === 'loading'}
                                className="px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 min-w-[120px] justify-center"
                            >
                                {deployStatus === 'loading' ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Deploying...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        Deploy Agent
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                    </>
                    )}
                </div>

            </div>
        </div>
    );
};

export default DataInsightsAgentWizardModal;
