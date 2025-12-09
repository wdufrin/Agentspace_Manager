
import React, { useState, useMemo } from 'react';
import { Config, AppEngine, DataStore, CloudRunService, ReasoningEngine } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';

interface CostAssessmentPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

interface CostResource {
    type: 'Reasoning Engine' | 'Vertex AI Search App' | 'Data Store' | 'Cloud Run Service' | 'Cloud Run (A2A)';
    name: string;
    location: string;
    pricingModel: string;
    usageRequestCount?: number;
    usageComputeStorage?: number; // Stores Instance Time or Storage size
}

const CostAssessmentPage: React.FC<CostAssessmentPageProps> = ({ projectNumber, setProjectNumber }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingUsage, setIsFetchingUsage] = useState(false);
    const [resources, setResources] = useState<CostResource[]>([]);
    const [error, setError] = useState<string | null>(null);

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
        projectId: projectNumber,
        appLocation: 'global',
        collectionId: '',
        appId: '',
        assistantId: '',
    }), [projectNumber]);

    const handleAssess = async () => {
        if (!projectNumber) return;
        setIsLoading(true);
        setError(null);
        setResources([]);

        try {
            const allResources: CostResource[] = [];
            const errors: string[] = [];

            // 1. Scan Reasoning Engines (Vertex AI)
            const reLocations = ['us-central1', 'us-east1', 'us-east4', 'us-west1', 'europe-west1', 'europe-west4', 'asia-east1', 'asia-southeast1'];
            await Promise.all(reLocations.map(async (loc) => {
                try {
                    const res = await api.listReasoningEngines({ ...apiConfig, reasoningEngineLocation: loc });
                    if (res.reasoningEngines) {
                        res.reasoningEngines.forEach(re => {
                            allResources.push({
                                type: 'Reasoning Engine',
                                name: re.displayName,
                                location: loc,
                                pricingModel: 'Vertex AI Runtime (Per-Node/Hr or Consumption)'
                            });
                        });
                    }
                } catch (e) { /* ignore */ }
            }));

            // 2. Scan Discovery Engines & Data Stores (Vertex AI Agent Builder)
            const discoveryLocations = ['global', 'us', 'eu'];
            await Promise.all(discoveryLocations.map(async (loc) => {
                const locConfig = { ...apiConfig, appLocation: loc, collectionId: 'default_collection' };
                
                // Engines
                try {
                    const res = await api.listResources('engines', locConfig);
                    if (res.engines) {
                        res.engines.forEach((eng: AppEngine) => {
                            allResources.push({
                                type: 'Vertex AI Search App',
                                name: eng.displayName,
                                location: loc,
                                pricingModel: 'Search Edition (Standard/Enterprise) + Queries'
                            });
                        });
                    }
                } catch (e) { /* ignore */ }

                // Data Stores
                try {
                    const res = await api.listResources('dataStores', locConfig);
                    if (res.dataStores) {
                        res.dataStores.forEach((ds: DataStore) => {
                            allResources.push({
                                type: 'Data Store',
                                name: ds.displayName,
                                location: loc,
                                pricingModel: 'Storage ($/GB/mo) + Indexing'
                            });
                        });
                    }
                } catch (e) { /* ignore */ }
            }));

            // 3. Scan Cloud Run (A2A Agents)
            const crRegions = ['us-central1', 'us-east1', 'europe-west1', 'asia-east1'];
            await Promise.all(crRegions.map(async (region) => {
                try {
                    const res = await api.listCloudRunServices(apiConfig, region);
                    if (res.services) {
                        res.services.forEach((svc: CloudRunService) => {
                            const isA2a = svc.template?.containers?.[0]?.env?.some(e => e.name === 'AGENT_URL');
                            allResources.push({
                                type: isA2a ? 'Cloud Run (A2A)' : 'Cloud Run Service',
                                name: svc.name.split('/').pop()!,
                                location: region,
                                pricingModel: 'CPU/Memory Allocation Time (Consumption)'
                            });
                        });
                    }
                } catch (e) { /* ignore */ }
            }));

            setResources(allResources);

        } catch (err: any) {
            setError(err.message || "Failed to assess costs.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFetchUsage = async () => {
        setIsFetchingUsage(true);
        const endTime = new Date();
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 30); // Last 30 days

        try {
            const updatedResources = await Promise.all(resources.map(async (r) => {
                let requestCount = 0;
                let computeStorage = 0;

                if (r.type === 'Cloud Run Service' || r.type === 'Cloud Run (A2A)') {
                    const serviceName = r.name; // assuming resource.name is the short name from scan
                    // Filter for Request Count
                    const reqFilter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND metric.type="run.googleapis.com/request_count"`;
                    requestCount = await api.fetchMetric(apiConfig.projectId, reqFilter, startTime, endTime, 'REDUCE_SUM');
                    
                    // Filter for Billable Instance Time
                    const timeFilter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND metric.type="run.googleapis.com/container/billable_instance_time"`;
                    computeStorage = await api.fetchMetric(apiConfig.projectId, timeFilter, startTime, endTime, 'REDUCE_SUM');
                } else if (r.type === 'Reasoning Engine') {
                    // Try generic Vertex AI prediction metric
                    const reqFilter = `resource.type="aiplatform.googleapis.com/Endpoint" AND metric.type="aiplatform.googleapis.com/prediction/online/prediction_count"`;
                    // Note: This filter is broad for the project if resource labels aren't specific to RE ID in monitoring yet.
                    requestCount = await api.fetchMetric(apiConfig.projectId, reqFilter, startTime, endTime, 'REDUCE_SUM');
                } else if (r.type === 'Vertex AI Search App' || r.type === 'Data Store') {
                    // Discovery Engine metrics are often project-level
                    // Use a broad filter for now or specific if resource name matches pattern
                    const reqFilter = `resource.type="consumed_api" AND resource.labels.service="discoveryengine.googleapis.com" AND metric.type="serviceruntime.googleapis.com/api/request_count"`;
                    // This will be total for project, not per resource, but gives an idea
                    const projectTotal = await api.fetchMetric(apiConfig.projectId, reqFilter, startTime, endTime, 'REDUCE_SUM');
                    // Mark as project-wide if we can't split
                    requestCount = projectTotal; 
                }

                return { ...r, usageRequestCount: requestCount, usageComputeStorage: computeStorage };
            }));
            
            setResources(updatedResources);
        } catch (e: any) {
            console.error("Failed to fetch usage", e);
            setError("Partial failure fetching usage metrics. Check console for details.");
        } finally {
            setIsFetchingUsage(false);
        }
    };

    const counts = useMemo(() => {
        return resources.reduce((acc, curr) => {
            acc[curr.type] = (acc[curr.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [resources]);

    const formatUsage = (val?: number) => {
        if (val === undefined) return '-';
        if (val === 0) return '0';
        if (val > 1000000) return `${(val / 1000000).toFixed(1)}M`;
        if (val > 1000) return `${(val / 1000).toFixed(1)}k`;
        return val.toString();
    };

    const formatCompute = (val?: number, type?: string) => {
        if (!val) return '-';
        if (type?.includes('Cloud Run')) {
            // Billable time is in seconds
            const hours = val / 3600;
            return `${hours.toFixed(1)} hrs`;
        }
        return val.toString();
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-white mb-3">Project Cost Estimator (Beta)</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Scan your project to identify active resources that may contribute to your monthly bill. 
                    This tool lists known Gemini Enterprise and Cloud Run resources.
                </p>
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <button 
                        onClick={handleAssess} 
                        disabled={isLoading || !projectNumber}
                        className="px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600 h-[38px] w-48 flex justify-center items-center"
                    >
                        {isLoading ? <Spinner /> : 'Assess Project'}
                    </button>
                </div>
            </div>

            {error && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg">{error}</div>}

            {resources.length > 0 && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gray-800 p-4 rounded-lg border border-purple-500/30">
                            <h3 className="text-xs font-bold text-purple-400 uppercase">Reasoning Engines</h3>
                            <p className="text-3xl font-bold text-white mt-1">{counts['Reasoning Engine'] || 0}</p>
                            <p className="text-xs text-gray-500 mt-2">Active Runtimes</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-blue-500/30">
                            <h3 className="text-xs font-bold text-blue-400 uppercase">Vertex AI Apps</h3>
                            <p className="text-3xl font-bold text-white mt-1">{counts['Vertex AI Search App'] || 0}</p>
                            <p className="text-xs text-gray-500 mt-2">Search/Chat Engines</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-cyan-500/30">
                            <h3 className="text-xs font-bold text-cyan-400 uppercase">Data Stores</h3>
                            <p className="text-3xl font-bold text-white mt-1">{counts['Data Store'] || 0}</p>
                            <p className="text-xs text-gray-500 mt-2">Vector/Structured Indices</p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-teal-500/30">
                            <h3 className="text-xs font-bold text-teal-400 uppercase">Cloud Run</h3>
                            <p className="text-3xl font-bold text-white mt-1">{(counts['Cloud Run Service'] || 0) + (counts['Cloud Run (A2A)'] || 0)}</p>
                            <p className="text-xs text-gray-500 mt-2">Services / Agents</p>
                        </div>
                    </div>

                    {/* Detailed List */}
                    <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">Resource Inventory & Cost Drivers</h3>
                            <button 
                                onClick={handleFetchUsage} 
                                disabled={isFetchingUsage}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 flex items-center gap-2"
                            >
                                {isFetchingUsage ? (
                                    <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                                        Fetching...
                                    </>
                                ) : 'Fetch Usage (30d)'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Resource Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Location</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Pricing Model (Est.)</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Est. Requests (30d)</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Est. Compute/Storage</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {resources.map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-700/30">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{r.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.type}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{r.location}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-300">{r.pricingModel}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-mono">
                                                {formatUsage(r.usageRequestCount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-mono">
                                                {formatCompute(r.usageComputeStorage, r.type)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg">
                        <p className="text-sm text-yellow-200">
                            <strong>Disclaimer:</strong> This is a resource inventory tool, not an official billing calculator. 
                            Estimated usage is derived from Cloud Monitoring metrics (e.g., request counts) and may differ from billing data.
                            Check the <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="underline hover:text-white">Google Cloud Billing Console</a> for accurate costs.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

export default CostAssessmentPage;
