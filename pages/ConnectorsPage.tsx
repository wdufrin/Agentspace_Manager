import React, { useState, useEffect, useCallback } from 'react';
import { Config, Collection } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import ConnectorDetailsModal from '../components/ConnectorDetailsModal';

interface ConnectorsPageProps {
    projectNumber: string;
    setProjectNumber: (projectNumber: string) => void;
    accessToken: string;
}

interface ValidationResult {
    status: 'pending' | 'success' | 'error' | 'n/a';
    message?: string;
    details?: any;
    dataConnector?: any;
}

const ConnectorsPage: React.FC<ConnectorsPageProps> = ({ projectNumber, setProjectNumber }) => {
    const [config, setConfig] = useState<Config>({
        projectId: projectNumber,
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: '',
        assistantId: ''
    });

    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
    const [selectedResult, setSelectedResult] = useState<{ result: ValidationResult, title: string } | null>(null);

    useEffect(() => {
        setConfig(prev => ({ ...prev, projectId: projectNumber }));
    }, [projectNumber]);

    const fetchCollections = useCallback(async () => {
        if (!config.projectId) return;
        setIsLoading(true);
        setError(null);
        setCollections([]);
        setValidationResults({});

        try {
            const response = await api.listResources('collections', config);
            const cols = response.collections || [];

            // If no collections, we can still show 'default_collection' if the user wants to check it
            // But usually list collections is accurate.
            setCollections(cols);
        } catch (err: any) {
            console.error("Failed to fetch collections:", err);
            setError(err.message || "Failed to fetch collections.");
        } finally {
            setIsLoading(false);
        }
    }, [config]);

    useEffect(() => {
        if (config.projectId) {
            fetchCollections();
        }
    }, [fetchCollections]);

    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    const [isBulkScanning, setIsBulkScanning] = useState(false);

    const checkDataConnector = async (collection: Collection) => {
        const collectionId = collection.name.split('/').pop() || 'default_collection';

        if (collectionId === 'default_collection') {
            setValidationResults(prev => ({
                ...prev,
                [collection.name]: {
                    status: 'n/a',
                    message: 'Not Applicable for Default Connector',
                    details: 'Default connector does not require validation.'
                }
            }));
            return;
        }

        const collectionConfig = { ...config, collectionId: collectionId };

        setValidationResults(prev => ({
            ...prev,
            [collection.name]: { status: 'pending' }
        }));

        const diagnostics: any = {
            steps: [],
            warnings: [],
            errors: []
        };

        const addStep = (name: string, status: 'ok' | 'fail' | 'info', details?: any) => {
            diagnostics.steps.push({ name, status, details, time: new Date().toISOString() });
        };

        try {
            // 1. Get DataConnector
            addStep('Fetch DataConnector', 'info', { api: `projects.locations.collections.dataConnector.get`, collectionId });
            let connector: any = null;
            try {
                connector = await api.getDataConnector(collectionConfig);
                if (connector && connector.state === 'FAILED') {
                    addStep('Fetch DataConnector', 'fail', connector);
                } else if (connector && connector.state === 'INACTIVE') {
                    addStep('Fetch DataConnector', 'info', connector);
                } else {
                    addStep('Fetch DataConnector', 'ok', connector);
                }
            } catch (e: any) {
                addStep('Fetch DataConnector', 'fail', e.message);
                throw e; // Stop if we can't even get the connector status (it might not exist)
            }

            // 2. Fetch Recent Operations
            addStep('Fetch Recent Operations', 'info', { api: `projects.locations.collections.operations.list` });
            let recentOps: any[] = [];
            try {
                // Try to filter operations relevant to this collection if possible, or just fetch all
                // The API call I added supports filter, but let's just fetch recent ones for now.
                const operationsResponse = await api.listOperations(collectionConfig);
                recentOps = operationsResponse.operations || [];
                addStep('Fetch Recent Operations', 'ok', { count: recentOps.length });
            } catch (e: any) {
                addStep('Fetch Recent Operations', 'fail', e.message);
                diagnostics.warnings.push("Could not list operations. Diagnostics might be incomplete.");
            }



            // 4. Analyze Health (Existing Logic)
            let status: 'success' | 'error' = 'success';
            let message = 'Connector Active';

            if (connector.state === 'FAILED') {
                status = 'error';
                message = 'Connector State: FAILED';
                diagnostics.errors.push(`Connector is in FAILED state.`);
            } else if (connector.state === 'INACTIVE') {
                // Inactive might be okay if it's just paused, but usually we want ACTIVE
                message = `Connector State: ${connector.state}`;
            }

            // Check for Sync Run Errors (Data Plane)
            // This captures auth errors that don't fail the connector state itself
            if (connector.latestRun && connector.latestRun.error) {
                status = 'error';
                message = `Sync Error: ${connector.latestRun.error.message || 'Unknown Error'}`;
                diagnostics.errors.push(`Latest Sync Run Failed: ${JSON.stringify(connector.latestRun.error)}`);
            } else if (connector.errorConfig && connector.errorConfig.error) {
                // Some connectors report generic errors here
                status = 'error';
                message = `Connector Error: ${connector.errorConfig.error.message || 'Configuration Error'}`;
                diagnostics.errors.push(`Connector Error Config: ${JSON.stringify(connector.errorConfig)}`);
            }

            // Analyze recent operations for failures
            const failures = recentOps.filter((op: any) => op.error && new Date(op.metadata?.createTime).getTime() > Date.now() - 86400000); // Last 24h
            if (failures.length > 0) {
                diagnostics.warnings.push(`Found ${failures.length} failed operations in the last 24h.`);
                failures.forEach((op: any) => {
                    addStep(`Operation Failed: ${op.name}`, 'fail', op.error);
                });
            }

            // 5. Fetch Recent Error Logs
            addStep('Fetch Recent Error Logs', 'info', { filter: 'severity>=ERROR AND >= 2h ago' });
            let recentLogs: any[] = [];
            try {
                const logsResponse = await api.fetchConnectorLogs(collectionConfig, connector.name, 2);
                recentLogs = logsResponse.entries || [];
                if (recentLogs.length > 0) {
                    addStep('Fetch Recent Error Logs', 'fail', { count: recentLogs.length, latest: recentLogs[0].textPayload || 'See Details' });
                    diagnostics.errors.push(`Found ${recentLogs.length} error logs in the last 2 hours.`);
                    // Mark validaton as Failed if we have recent errors
                    status = 'error';
                    message = `Validation Failed: ${recentLogs.length} Recent Errors`;
                } else {
                    addStep('Fetch Recent Error Logs', 'ok', { count: 0 });
                }
            } catch (e: any) {
                addStep('Fetch Recent Error Logs', 'fail', e.message);
                diagnostics.warnings.push("Could not fetch Cloud Logging entries.");
            }

            // 4. Construct Result
            setValidationResults(prev => ({
                ...prev,
                [collection.name]: {
                    status: status,
                    message: message,
                    dataConnector: connector,
                    details: {
                        summary: message,
                        connectorState: connector,
                        diagnostics: diagnostics,
                        rawOperations: recentOps.slice(0, 5), // Show last 5 ops
                        recentLogs: recentLogs // New field
                    }
                }
            }));

        } catch (err: any) {
            setValidationResults(prev => ({
                ...prev,
                [collection.name]: {
                    status: 'error',
                    message: `Check Failed: ${err.message}`,
                    details: {
                        error: err.message,
                        diagnostics: diagnostics
                    }
                }
            }));
        }
    };

    const handleBulkDiagnostics = async () => {
        setIsBulkScanning(true);
        // We use Promise.all to run them concurrently. 
        // Note: Promise.all will reject if one fails, but checkDataConnector handles its own errors internally 
        // and doesn't throw, updating state instead. So Promise.all is safe here.
        await Promise.all(collections.map(collection => checkDataConnector(collection)));
        setIsBulkScanning(false);
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-3">Connector Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <div>
                        <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                        <select
                            name="appLocation"
                            value={config.appLocation}
                            onChange={handleConfigChange}
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500"
                        >
                            <option value="global">global</option>
                            <option value="us">us</option>
                            <option value="eu">eu</option>
                        </select>
                    </div>
                    <div className="flex items-end space-x-2">
                        <button
                            onClick={fetchCollections}
                            disabled={isLoading || !config.projectId}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 h-[42px]"
                        >
                            {isLoading ? 'Scanning...' : 'Scan Collections'}
                        </button>
                        <button
                            onClick={handleBulkDiagnostics}
                            disabled={collections.length === 0 || isBulkScanning}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 h-[42px] flex items-center"
                        >
                            {isBulkScanning && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                            {isBulkScanning ? 'Scanning...' : 'Run Bulk Diagnosis'}
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-900/50 text-red-300 p-4 rounded-lg">
                    {error}
                </div>
            )}

            {!isLoading && collections.length > 0 && (
                <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
                    <div className="p-4 border-b border-gray-700">
                        <h3 className="text-lg font-bold text-white">Collections ({collections.length})</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Collection ID</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {collections.map((collection) => {
                                    const collectionId = collection.name.split('/').pop() || '';
                                    const result = validationResults[collection.name];

                                    return (
                                        <tr key={collection.name} className="hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                                {collection.displayName || collectionId}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                                                {collectionId}
                                            </td>
                                            <td className="px-6 py-4 whitespace-normal text-sm">
                                                {result ? (
                                                    <div
                                                        className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors shadow-sm ${result.status === 'success'
                                                            ? 'bg-green-900/80 text-green-200 border border-green-700 hover:bg-green-800'
                                                            : result.status === 'error'
                                                                ? 'bg-red-900/80 text-red-200 border border-red-700 hover:bg-red-800'
                                                                : result.status === 'n/a'
                                                                    ? 'bg-gray-700/80 text-gray-300 border border-gray-600 hover:bg-gray-600'
                                                                    : 'bg-blue-900/80 text-blue-200 border border-blue-700'
                                                            }`}
                                                        onClick={() => {
                                                            if (result.status !== 'n/a') {
                                                                setSelectedResult({
                                                                    result,
                                                                    title: `Connector Diagnostics: ${collectionId}`
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        {result.status === 'pending' && <svg className="animate-spin h-3 w-3 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                                                        {result.status === 'success' ? 'PASS' : result.status === 'error' ? 'FAIL' : result.status === 'n/a' ? 'N/A' : 'CHECKING'}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-500 text-xs italic">Not checked</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => checkDataConnector(collection)}
                                                    className="text-blue-400 hover:text-blue-300 font-semibold text-xs border border-blue-500/30 px-3 py-1.5 rounded hover:bg-blue-500/10 transition-colors"
                                                >
                                                    Run Diagnostics
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ConnectorDetailsModal
                isOpen={!!selectedResult}
                onClose={() => setSelectedResult(null)}
                title={selectedResult?.title || 'Details'}
                data={selectedResult?.result.details || selectedResult?.result.message}
                status={selectedResult?.result.status === 'success' ? 'success' : 'error'}
            />
        </div>
    );
};

export default ConnectorsPage;
