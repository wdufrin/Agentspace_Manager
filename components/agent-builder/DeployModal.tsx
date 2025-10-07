import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Config, ReasoningEngine, GcsBucket, GcsObject } from '../../types';
import * as api from '../../services/apiService';

interface DeployInfo {
    engineName: string;
    gcsStagingUri: string;
    location: string;
    deployMode: 'existing' | 'new';
    newEngineDisplayName: string;
    pickleGcsUri: string;
}
interface DeployModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDeploy: (deployInfo: DeployInfo, addLog: (log: string) => void) => Promise<void>;
    config: Config;
}

const Instructions: React.FC = () => (
    <div className="space-y-3 text-xs text-gray-400 bg-gray-900/50 p-3 rounded-md border border-gray-700">
        <p className="font-bold text-sm text-yellow-300">Action Required: Create and Upload Agent Pickle File</p>
        <p>The Reasoning Engine requires a Python "pickle" file to deploy. This cannot be created in the browser.</p>
        <ol className="list-decimal list-inside space-y-2">
            <li>
                <strong>Download Your Agent Code:</strong> Use the "Download" button on the main page to get a <code>.zip</code> file containing <code>agent.py</code> and <code>requirements.txt</code>.
            </li>
            <li>
                <strong>Create the Pickle File:</strong>
                <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
                    <li>Unzip the files into a new folder.</li>
                    <li>Create a new file named <code>create_pickle.py</code> in the same folder with this content:
                        <pre className="bg-gray-800 p-2 rounded-md text-gray-300 mt-1 text-xs whitespace-pre-wrap">
{`import pickle
from agent import app

with open('agent.pkl', 'wb') as f:
    pickle.dump(app, f)

print("Successfully created agent.pkl")`}
                        </pre>
                    </li>
                    <li>In your terminal, navigate to the folder and run the script: <code className="bg-gray-800 p-1 rounded">python create_pickle.py</code></li>
                    <li>This will create an <strong>agent.pkl</strong> file.</li>
                </ul>
            </li>
            <li>
                <strong>Upload to GCS:</strong> Upload <code>agent.pkl</code> and <code>requirements.txt</code> to your GCS staging directory.
                <br />
                Example: <code className="bg-gray-800 p-1 rounded">gcloud storage cp agent.pkl gs://your-bucket/folder/</code>
            </li>
            <li>
                <strong>Provide the GCS URI:</strong> Use the controls below to select the bucket and <code>.pkl</code> file you uploaded.
            </li>
        </ol>
    </div>
);


const DeployModal: React.FC<DeployModalProps> = ({ isOpen, onClose, onDeploy, config }) => {
    // Reasoning Engine state
    const [location, setLocation] = useState(config.reasoningEngineLocation || 'us-central1');
    const [engineName, setEngineName] = useState('');
    const [engines, setEngines] = useState<ReasoningEngine[]>([]);
    const [isLoadingEngines, setIsLoadingEngines] = useState(false);
    const [engineLoadError, setEngineLoadError] = useState<string | null>(null);
    const [deployMode, setDeployMode] = useState<'existing' | 'new'>('existing');
    const [newEngineDisplayName, setNewEngineDisplayName] = useState('');

    // GCS State
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [bucketLoadError, setBucketLoadError] = useState<string | null>(null);
    const [selectedBucket, setSelectedBucket] = useState('');
    const [gcsPrefix, setGcsPrefix] = useState(''); // for folder path
    const [objects, setObjects] = useState<GcsObject[]>([]);
    const [isLoadingObjects, setIsLoadingObjects] = useState(false);
    const [objectLoadError, setObjectLoadError] = useState<string | null>(null);
    const [selectedObject, setSelectedObject] = useState(''); // Full object name, e.g. folder/agent.pkl

    // Deployment process state
    const [isDeploying, setIsDeploying] = useState(false);
    const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
    
    const addLog = useCallback((log: string) => {
        setDeploymentLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
    }, []);

    const apiConfig = useMemo(() => ({
        ...config,
        reasoningEngineLocation: location,
    }), [config, location]);

    const fetchEngines = useCallback(async () => {
        if (!apiConfig.projectId || !apiConfig.accessToken || !location) {
            setEngines([]);
            return;
        }
        setIsLoadingEngines(true);
        setEngineLoadError(null);
        setEngines([]);
        try {
            const res = await api.listReasoningEngines(apiConfig);
            setEngines(res.reasoningEngines || []);
            if (!res.reasoningEngines || res.reasoningEngines.length === 0) {
                setEngineLoadError(`No reasoning engines found in ${location}. Consider creating a new one.`);
            }
        } catch (err: any) {
            setEngineLoadError(err.message || 'Failed to load reasoning engines.');
        } finally {
            setIsLoadingEngines(false);
        }
    }, [apiConfig]);

    const handleLoadBuckets = useCallback(async () => {
        if (!apiConfig.projectId || !apiConfig.accessToken) return;
        setIsLoadingBuckets(true);
        setBucketLoadError(null);
        setBuckets([]);
        setSelectedBucket('');
        setObjects([]);
        setSelectedObject('');
        try {
            const res = await api.listBuckets(apiConfig.projectId, apiConfig.accessToken);
            setBuckets(res.items || []);
        } catch (err: any) {
            setBucketLoadError(err.message || 'Failed to load buckets.');
        } finally {
            setIsLoadingBuckets(false);
        }
    }, [apiConfig]);

    const handleLoadObjects = useCallback(async () => {
        if (!selectedBucket) return;
        setIsLoadingObjects(true);
        setObjectLoadError(null);
        setObjects([]);
        setSelectedObject('');
        try {
            const res = await api.listGcsObjects(selectedBucket, gcsPrefix, apiConfig.accessToken, apiConfig.projectId);
            const pklFiles = (res.items || []).filter(item => item.name.endsWith('.pkl'));
            setObjects(pklFiles);
            if (pklFiles.length === 0) {
                setObjectLoadError('No .pkl files found in this location.');
            }
        } catch (err: any) {
            setObjectLoadError(err.message || 'Failed to load files from bucket.');
        } finally {
            setIsLoadingObjects(false);
        }
    }, [selectedBucket, gcsPrefix, apiConfig]);
    
     useEffect(() => {
        if (isOpen && deployMode === 'existing') {
            fetchEngines();
        }
    }, [isOpen, deployMode, fetchEngines]);

    const handleDeploy = async () => {
        setIsDeploying(true);
        setDeploymentLogs([]);
        
        const stagingUri = `gs://${selectedBucket}/${gcsPrefix ? (gcsPrefix.endsWith('/') ? gcsPrefix : `${gcsPrefix}/`) : ''}`;
        const pickleUri = `gs://${selectedBucket}/${selectedObject}`;
        
        const deployInfo: DeployInfo = { 
            engineName, 
            gcsStagingUri: stagingUri, 
            location, 
            deployMode, 
            newEngineDisplayName, 
            pickleGcsUri: pickleUri 
        };
        try {
            await onDeploy(deployInfo, addLog);
        } catch (err) {
            // Error is already logged by the parent function
        } finally {
            setIsDeploying(false);
        }
    };
    
    const handleClose = () => {
        if (isDeploying) return;
        setDeploymentLogs([]);
        setEngineName('');
        setNewEngineDisplayName('');
        setDeployMode('existing');
        // Reset GCS state
        setBuckets([]);
        setSelectedBucket('');
        setGcsPrefix('');
        setObjects([]);
        setSelectedObject('');
        setBucketLoadError(null);
        setObjectLoadError(null);
        onClose();
    };
    
    const isDeployDisabled = () => {
        if (isDeploying || !selectedBucket || !selectedObject) return true;
        if (deployMode === 'existing' && !engineName) return true;
        if (deployMode === 'new' && !newEngineDisplayName.trim()) return true;
        return false;
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Deploy Agent to Reasoning Engine</h2>
                    <button onClick={handleClose} disabled={isDeploying} className="text-gray-400 hover:text-white disabled:opacity-50">&times;</button>
                </header>
                
                <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
                    {/* Left: Instructions & Config */}
                    <div className="space-y-4">
                        <Instructions />
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-400">GCS Bucket <span className="text-red-400">*</span></label>
                            <div className="flex items-center gap-2 mt-1">
                                <select 
                                    value={selectedBucket} 
                                    onChange={(e) => setSelectedBucket(e.target.value)} 
                                    className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" 
                                    disabled={isDeploying || isLoadingBuckets}
                                >
                                    <option value="">{isLoadingBuckets ? 'Loading...' : '-- Select a Bucket --'}</option>
                                    {buckets.map(bucket => <option key={bucket.id} value={bucket.name}>{bucket.name}</option>)}
                                </select>
                                <button onClick={handleLoadBuckets} disabled={isLoadingBuckets || isDeploying} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 h-[38px] shrink-0">
                                    {isLoadingBuckets ? '...' : 'Load'}
                                </button>
                            </div>
                            {bucketLoadError && <p className="text-xs text-red-400 mt-1">{bucketLoadError}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Folder Prefix & Pickle File <span className="text-red-400">*</span></label>
                            <div className="flex items-center gap-2 mt-1">
                                <input 
                                    type="text" 
                                    value={gcsPrefix} 
                                    onChange={(e) => setGcsPrefix(e.target.value)} 
                                    placeholder="folder/path/ (optional)" 
                                    className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" 
                                    disabled={isDeploying || !selectedBucket} 
                                />
                                <button onClick={handleLoadObjects} disabled={isLoadingObjects || isDeploying || !selectedBucket} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 h-[38px] shrink-0">
                                    {isLoadingObjects ? '...' : 'Load'}
                                </button>
                            </div>
                            <select 
                                value={selectedObject} 
                                onChange={(e) => setSelectedObject(e.target.value)} 
                                className="mt-2 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" 
                                disabled={isDeploying || isLoadingObjects || objects.length === 0}
                            >
                                <option value="">{isLoadingObjects ? 'Loading...' : '-- Select .pkl File --'}</option>
                                {objects.map(obj => <option key={obj.name} value={obj.name}>{obj.name.substring(gcsPrefix.length)}</option>)}
                            </select>
                            {objectLoadError && <p className="text-xs text-red-400 mt-1">{objectLoadError}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400">Deployment Target</label>
                             <div className="flex gap-4 mt-2">
                                <label className="flex items-center">
                                    <input type="radio" value="existing" checked={deployMode === 'existing'} onChange={() => setDeployMode('existing')} className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-600"/>
                                    <span className="ml-2 text-sm text-gray-300">Existing Engine</span>
                                </label>
                                <label className="flex items-center">
                                    <input type="radio" value="new" checked={deployMode === 'new'} onChange={() => setDeployMode('new')} className="form-radio h-4 w-4 text-blue-600 bg-gray-700 border-gray-600"/>
                                    <span className="ml-2 text-sm text-gray-300">Create New Engine</span>
                                </label>
                            </div>
                        </div>

                        {deployMode === 'new' && (
                             <div>
                                <label className="block text-sm font-medium text-gray-400">New Engine Display Name <span className="text-red-400">*</span></label>
                                <input
                                    type="text"
                                    value={newEngineDisplayName}
                                    onChange={(e) => setNewEngineDisplayName(e.target.value)}
                                    placeholder="My New Agent Engine"
                                    className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2"
                                    disabled={isDeploying}
                                />
                            </div>
                        )}
                        
                        {deployMode === 'existing' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Target Location & Engine <span className="text-red-400">*</span></label>
                                <div className="flex items-center gap-2 mt-1">
                                    <select value={location} onChange={(e) => setLocation(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" disabled={isDeploying}>
                                        <option value="us-central1">us-central1</option><option value="us-east1">us-east1</option><option value="us-east4">us-east4</option><option value="us-west1">us-west1</option><option value="europe-west1">europe-west1</option><option value="europe-west2">europe-west2</option><option value="europe-west4">europe-west4</option><option value="asia-east1">asia-east1</option><option value="asia-southeast1">asia-southeast1</option>
                                    </select>
                                    <button onClick={fetchEngines} disabled={isLoadingEngines || isDeploying} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 h-[38px] shrink-0">
                                        {isLoadingEngines ? '...' : 'Refresh'}
                                    </button>
                                </div>
                                <select value={engineName} onChange={(e) => setEngineName(e.target.value)} className="mt-2 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" disabled={isLoadingEngines || isDeploying || engines.length === 0}>
                                    <option value="">{isLoadingEngines ? 'Loading...' : '-- Select an Engine to Update --'}</option>
                                    {engines.map(engine => (
                                        <option key={engine.name} value={engine.name}>{engine.displayName} ({engine.name.split('/').pop()})</option>
                                    ))}
                                </select>
                                {engineLoadError && <p className="text-xs text-red-400 mt-1">{engineLoadError}</p>}
                            </div>
                        )}
                    </div>

                    {/* Right: Logs */}
                    <div>
                         <h3 className="text-lg font-semibold text-white mb-2">Deployment Log</h3>
                         <div className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-full min-h-[300px] overflow-y-auto font-mono">
                            {deploymentLogs.length > 0 ? deploymentLogs.join('\n') : <span className="text-gray-500">Ready to deploy...</span>}
                         </div>
                    </div>
                </main>

                <footer className="p-4 border-t border-gray-700 flex justify-end space-x-3">
                    <button onClick={handleClose} disabled={isDeploying} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Close</button>
                    <button onClick={handleDeploy} disabled={isDeployDisabled()} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed min-w-[120px]">
                        {isDeploying ? (
                             <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                Deploying...
                            </div>
                        ) : 'Deploy'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DeployModal;