
import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/apiService';
import { GcsBucket } from '../../types';

declare var JSZip: any;

interface A2aDeployModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectNumber: string;
    serviceName: string;
    region: string;
    files: { name: string; content: string }[];
    onBuildTriggered?: (buildId: string) => void;
}

const A2aDeployModal: React.FC<A2aDeployModalProps> = ({ 
    isOpen, 
    onClose, 
    projectNumber, 
    serviceName, 
    region, 
    files, 
    onBuildTriggered 
}) => {
    const [projectId, setProjectId] = useState(projectNumber);
    const [isResolvingId, setIsResolvingId] = useState(false);
    
    // Bucket State
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [bucketError, setBucketError] = useState<string | null>(null);

    // Deployment state
    const [isDeploying, setIsDeploying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    
    const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        
        // Reset state
        setError(null);
        setLogs([]);
        setIsDeploying(false);
        setProjectId(projectNumber); 
        setBuckets([]);
        setSelectedBucket('');
        setIsPermissionsExpanded(false);

        // 1. Resolve Project ID
        const resolveProject = async () => {
            setIsResolvingId(true);
            try {
                const p = await api.getProject(projectNumber);
                if (p.projectId) setProjectId(p.projectId);
            } catch (e) {
                console.warn("Could not resolve Project ID string");
            } finally {
                setIsResolvingId(false);
            }
        };
        resolveProject();
    }, [isOpen, projectNumber]);

    // Fetch Buckets
    useEffect(() => {
        if (!isOpen || !projectId) return;
        
        const fetchBuckets = async () => {
            setIsLoadingBuckets(true);
            setBucketError(null);
            try {
                const res = await api.listBuckets(projectId);
                const items = res.items || [];
                setBuckets(items);
                if (items.length > 0) {
                    setSelectedBucket(items[0].name);
                }
            } catch (e: any) {
                console.error("Failed to fetch buckets", e);
                setBucketError(e.message || "Failed to list buckets.");
            } finally {
                setIsLoadingBuckets(false);
            }
        };
        fetchBuckets();
    }, [isOpen, projectId]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleDeploy = async () => {
        if (!selectedBucket) {
            setError("Please select a GCS bucket for staging.");
            return;
        }

        setIsDeploying(true);
        setError(null);
        setLogs([]);
        addLog(`Starting deployment for ${serviceName}...`);

        try {
            // 1. Create Zip
            const zip = new JSZip();
            addLog("Preparing source files...");
            files.forEach(f => {
                zip.file(f.name, f.content);
            });

            const blob = await zip.generateAsync({ type: 'blob' });
            
            // 2. Upload Source to GCS
            const sourceObjectName = `source/${serviceName}-${Date.now()}.zip`;
            addLog(`Uploading source to gs://${selectedBucket}/${sourceObjectName}...`);
            addLog(`File size: ${(blob.size / 1024).toFixed(2)} KB`);
            
            const file = new File([blob], "source.zip", { type: "application/zip" });
            await api.uploadFileToGcs(selectedBucket, sourceObjectName, file, projectId);
            
            // 3. Construct Cloud Build Config
            const imageName = `gcr.io/${projectId}/${serviceName.toLowerCase()}`;
            addLog(`Target Image: ${imageName}`);
            
            // Note: We use the existing deploy.sh script content if available, but
            // usually it's cleaner to define build steps explicitly.
            // The generated deploy.sh does `gcloud run deploy --source .` which triggers another build.
            // Here, we do standard Docker Build -> Push -> Deploy Image.
            // This requires us to replicate the logic of `deploy.sh` (env vars, region, etc.)
            
            // Parse Env Vars from the generated main.py or deploy.sh to ensure consistency?
            // Actually, `files` contains `deploy.sh`. We can parse it or just execute it.
            // Executing `deploy.sh` inside Cloud Build container is easiest as it contains all logic.
            // But `gcloud run deploy --source .` inside Cloud Build works best if we use `gcr.io/google.com/cloudsdktool/cloud-sdk`.
            
            // Let's try executing deploy.sh directly.
            // However, we need to ensure permissions are correct.
            
            const buildConfig: any = {
                source: {
                    storageSource: {
                        bucket: selectedBucket,
                        object: sourceObjectName
                    }
                },
                steps: [
                    {
                        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                        entrypoint: 'bash',
                        args: ['deploy.sh'],
                        env: [`GOOGLE_CLOUD_PROJECT=${projectId}`] // Ensure project ID is available
                    }
                ],
                timeout: "600s"
            };

            // 4. Trigger Build
            addLog('Triggering Cloud Build...');
            const buildOp = await api.createCloudBuild(projectId, buildConfig);
            const triggeredBuildId = buildOp.metadata?.build?.id || 'unknown';
            
            if (onBuildTriggered && triggeredBuildId !== 'unknown') {
                onBuildTriggered(triggeredBuildId);
            }

            addLog(`Build triggered! ID: ${triggeredBuildId}`);
            addLog(`You can close this window. The build progress will be tracked globally.`);
            onClose();

        } catch (err: any) {
            setError(err.message || 'Deployment failed');
            addLog(`Error: ${err.message}`);
            setIsDeploying(false);
        }
    };

    const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
    const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/artifactregistry.admin"`;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col border border-gray-700 max-h-[90vh]">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-teal-400">Deploy Function:</span> {serviceName}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isDeploying}>&times;</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Project Info */}
                    <div className="bg-blue-900/20 border border-blue-800 p-3 rounded-md flex justify-between items-center">
                        <div>
                            <p className="text-xs text-blue-300 uppercase font-semibold">Target Project ID</p>
                            <p className="text-sm text-white font-mono">{projectId}</p>
                        </div>
                        {isResolvingId && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>}
                    </div>

                    {/* Staging Bucket */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Cloud Build Staging Bucket</label>
                        <div className="flex gap-2">
                            <select 
                                value={selectedBucket} 
                                onChange={(e) => setSelectedBucket(e.target.value)} 
                                className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
                                disabled={isLoadingBuckets || isDeploying}
                            >
                                {buckets.length === 0 && <option value="">{isLoadingBuckets ? 'Loading...' : 'No buckets found'}</option>}
                                {buckets.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                            </select>
                        </div>
                        {bucketError && <p className="text-xs text-red-400 mt-1">{bucketError}</p>}
                        <p className="text-xs text-gray-500 mt-1">GCS bucket to store the source code for Cloud Build.</p>
                    </div>

                    {/* Permissions Warning */}
                    <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md">
                        <button 
                            onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                            className="flex items-center justify-between w-full text-left"
                        >
                            <span className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                Cloud Build Permissions Required
                            </span>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-yellow-200 transition-transform ${isPermissionsExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        {isPermissionsExpanded && (
                            <div className="mt-3">
                                <p className="text-xs text-yellow-100 mb-2">
                                    Cloud Build needs <strong>Cloud Run Admin</strong> and <strong>Service Account User</strong> roles to deploy this service. Run this once in your terminal:
                                </p>
                                <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
                                     <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
                                        {grantPermissionsCommand}
                                    </pre>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(grantPermissionsCommand)}
                                        className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Logs & Errors */}
                    {(logs.length > 0 || error) && (
                        <div className="bg-black rounded-lg p-3 border border-gray-700 font-mono text-xs max-h-40 overflow-y-auto">
                            {error && <div className="text-red-400 mb-1">Error: {error}</div>}
                            {logs.map((log, i) => <div key={i} className="text-gray-300">{log}</div>)}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 flex justify-end space-x-3 bg-gray-800 rounded-b-xl">
                    <button onClick={onClose} disabled={isDeploying} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Close</button>
                    <button 
                        onClick={handleDeploy} 
                        disabled={isDeploying}
                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-md shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isDeploying ? (
                             <>
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                Deploying...
                            </>
                        ) : 'Launch Cloud Build'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default A2aDeployModal;
