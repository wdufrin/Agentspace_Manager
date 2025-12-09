
import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
    estimatedCostShare?: number; // Calculated field
}

interface BillingRow {
    service_name: string;
    sku_name: string;
    cost: number;
    currency: string;
}

const CostAssessmentPage: React.FC<CostAssessmentPageProps> = ({ projectNumber, setProjectNumber }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingUsage, setIsFetchingUsage] = useState(false);
    const [resources, setResources] = useState<CostResource[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Billing Data State
    const [billingTableId, setBillingTableId] = useState('');
    const [billingCosts, setBillingCosts] = useState<BillingRow[]>([]);
    const [isFetchingCosts, setIsFetchingCosts] = useState(false);
    const [billingError, setBillingError] = useState<string | null>(null);

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
        projectId: projectNumber,
        appLocation: 'global',
        collectionId: '',
        appId: '',
        assistantId: '',
    }), [projectNumber]);

    // --- Core Logic: Distribute Costs ---
    // This runs whenever resources (usage) or billingCosts changes to recalculate the shares.
    const distributeCosts = (currentResources: CostResource[], currentBilling: BillingRow[]) => {
        if (currentResources.length === 0) return currentResources;

        // 1. Group Billing Totals by Service Category
        const totals = {
            cloudRun: currentBilling.filter(r => r.service_name === 'Cloud Run').reduce((sum, r) => sum + r.cost, 0),
            vertexAi: currentBilling.filter(r => r.service_name === 'Vertex AI').reduce((sum, r) => sum + r.cost, 0),
            discovery: currentBilling.filter(r => r.service_name === 'Discovery Engine' || r.service_name === 'Vertex AI Agent Builder').reduce((sum, r) => sum + r.cost, 0),
        };

        // 2. Calculate Total Usage Metrics per Category (for weights)
        // We use request count as the primary weight for simplicity, falling back to equal distribution if 0.
        const usageTotals = {
            cloudRun: currentResources.filter(r => r.type.includes('Cloud Run')).reduce((sum, r) => sum + (r.usageRequestCount || 0), 0),
            vertexAi: currentResources.filter(r => r.type === 'Reasoning Engine').reduce((sum, r) => sum + (r.usageRequestCount || 0), 0),
            discovery: currentResources.filter(r => r.type === 'Vertex AI Search App' || r.type === 'Data Store').reduce((sum, r) => sum + (r.usageRequestCount || 0), 0),
        };

        // 3. Map Costs
        return currentResources.map(r => {
            let cost = 0;
            let weight = 0;
            let totalUsage = 0;
            let totalCategoryCost = 0;

            if (r.type.includes('Cloud Run')) {
                weight = r.usageRequestCount || 0;
                totalUsage = usageTotals.cloudRun;
                totalCategoryCost = totals.cloudRun;
            } else if (r.type === 'Reasoning Engine') {
                weight = r.usageRequestCount || 0;
                totalUsage = usageTotals.vertexAi;
                totalCategoryCost = totals.vertexAi;
            } else if (r.type === 'Vertex AI Search App' || r.type === 'Data Store') {
                weight = r.usageRequestCount || 0;
                totalUsage = usageTotals.discovery;
                totalCategoryCost = totals.discovery;
            }

            if (totalCategoryCost > 0) {
                if (totalUsage > 0) {
                    // Pro-rate based on usage
                    cost = (weight / totalUsage) * totalCategoryCost;
                } else {
                    // Fallback: Equal split if no usage data available but costs exist
                    const countInCat = currentResources.filter(i => {
                        if (r.type.includes('Cloud Run')) return i.type.includes('Cloud Run');
                        if (r.type === 'Reasoning Engine') return i.type === 'Reasoning Engine';
                        return i.type === 'Vertex AI Search App' || i.type === 'Data Store';
                    }).length;
                    cost = countInCat > 0 ? totalCategoryCost / countInCat : 0;
                }
            }

            return { ...r, estimatedCostShare: cost };
        });
    };

    const handleAssess = async () => {
        if (!projectNumber) return;
        setIsLoading(true);
        setError(null);
        setResources([]);

        try {
            const allResources: CostResource[] = [];

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
                                pricingModel: 'Vertex AI Runtime (Per-Node/Hr)'
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
                                pricingModel: 'Search Edition + Queries'
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
                                pricingModel: 'CPU/Mem Allocation'
                            });
                        });
                    }
                } catch (e) { /* ignore */ }
            }));

            // Apply existing billing data if available
            setResources(distributeCosts(allResources, billingCosts));

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
                    const serviceName = r.name;
                    const reqFilter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND metric.type="run.googleapis.com/request_count"`;
                    requestCount = await api.fetchMetric(apiConfig.projectId, reqFilter, startTime, endTime, 'REDUCE_SUM');
                    
                    const timeFilter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND metric.type="run.googleapis.com/container/billable_instance_time"`;
                    computeStorage = await api.fetchMetric(apiConfig.projectId, timeFilter, startTime, endTime, 'REDUCE_SUM');
                } else if (r.type === 'Reasoning Engine') {
                    const reqFilter = `resource.type="aiplatform.googleapis.com/Endpoint" AND metric.type="aiplatform.googleapis.com/prediction/online/prediction_count"`;
                    requestCount = await api.fetchMetric(apiConfig.projectId, reqFilter, startTime, endTime, 'REDUCE_SUM');
                } else if (r.type === 'Vertex AI Search App' || r.type === 'Data Store') {
                    const reqFilter = `resource.type="consumed_api" AND resource.labels.service="discoveryengine.googleapis.com" AND metric.type="serviceruntime.googleapis.com/api/request_count"`;
                    requestCount = await api.fetchMetric(apiConfig.projectId, reqFilter, startTime, endTime, 'REDUCE_SUM');
                }

                return { ...r, usageRequestCount: requestCount, usageComputeStorage: computeStorage };
            }));
            
            // Re-run distribution with new usage data
            setResources(distributeCosts(updatedResources, billingCosts));

        } catch (e: any) {
            console.error("Failed to fetch usage", e);
            setError("Partial failure fetching usage metrics. Check console for details.");
        } finally {
            setIsFetchingUsage(false);
        }
    };

    const handleFetchBillingCosts = async () => {
        if (!billingTableId || !projectNumber) return;
        setIsFetchingCosts(true);
        setBillingError(null);
        setBillingCosts([]);

        try {
            let projectStringId = projectNumber;
            if (/^\d+$/.test(projectNumber)) {
                try {
                    const p = await api.getProject(projectNumber);
                    projectStringId = p.projectId;
                } catch (e) {
                    throw new Error("Could not resolve Project ID string from number. Please manually enter the Project ID in the configuration above if this fails.");
                }
            }

            const query = `
                SELECT
                  service.description as service_name,
                  sku.description as sku_name,
                  SUM(cost) as cost,
                  currency
                FROM
                  \`${billingTableId}\`
                WHERE
                  project.id = "${projectStringId}"
                  AND usage_start_time >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                GROUP BY
                  1, 2, 4
                HAVING cost > 0
                ORDER BY
                  cost DESC
                LIMIT 100
            `;

            const result = await api.runBigQueryQuery(projectNumber, query);
            
            if (result.rows) {
                const rows: BillingRow[] = result.rows.map((r: any) => ({
                    service_name: r.f[0].v,
                    sku_name: r.f[1].v,
                    cost: parseFloat(r.f[2].v),
                    currency: r.f[3].v
                }));
                setBillingCosts(rows);
                // Re-distribute with new billing data
                setResources(prev => distributeCosts(prev, rows));
            } else {
                setBillingCosts([]);
            }

        } catch (err: any) {
            setBillingError(err.message || "Failed to fetch billing data.");
        } finally {
            setIsFetchingCosts(false);
        }
    };

    const aggregatedStats = useMemo(() => {
        const stats = {
            re: { count: 0, cost: 0 },
            vertexApp: { count: 0, cost: 0 },
            dataStore: { count: 0, cost: 0 },
            cloudRun: { count: 0, cost: 0 },
        };

        resources.forEach(r => {
            if (r.type === 'Reasoning Engine') {
                stats.re.count++;
                stats.re.cost += r.estimatedCostShare || 0;
            } else if (r.type === 'Vertex AI Search App') {
                stats.vertexApp.count++;
                stats.vertexApp.cost += r.estimatedCostShare || 0;
            } else if (r.type === 'Data Store') {
                stats.dataStore.count++;
                stats.dataStore.cost += r.estimatedCostShare || 0;
            } else if (r.type.includes('Cloud Run')) {
                stats.cloudRun.count++;
                stats.cloudRun.cost += r.estimatedCostShare || 0;
            }
        });
        return stats;
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
            const hours = val / 3600;
            return `${hours.toFixed(1)} hrs`;
        }
        return val.toString();
    };
    
    const formatMoney = (val?: number, currency = 'USD') => {
        if (val === undefined || val === 0) return '-';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(val);
    };

    const totalActualCost = billingCosts.reduce((sum, row) => sum + row.cost, 0);
    const currency = billingCosts[0]?.currency || 'USD';

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-xl font-bold text-white mb-3">Project Cost Estimator (Beta)</h2>
                <div className="flex flex-col gap-4">
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
                            {isLoading ? <Spinner /> : '1. Scan Resources'}
                        </button>
                    </div>
                    
                    <div className="border-t border-gray-700 pt-4 mt-2">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Optional: Billing Export Table (BigQuery)</label>
                        <div className="flex gap-4">
                            <input 
                                type="text" 
                                value={billingTableId} 
                                onChange={(e) => setBillingTableId(e.target.value)} 
                                className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200"
                                placeholder="project.dataset.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX"
                            />
                            <button
                                onClick={handleFetchBillingCosts}
                                disabled={isFetchingCosts || !billingTableId || !projectNumber}
                                className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 h-[38px] w-48 flex justify-center items-center whitespace-nowrap"
                            >
                                {isFetchingCosts ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                        Fetching...
                                    </>
                                ) : '2. Fetch Actual Costs'}
                            </button>
                        </div>
                        {billingError && <p className="text-red-400 text-xs mt-2">{billingError}</p>}
                    </div>
                </div>
            </div>

            {error && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg">{error}</div>}

            {resources.length > 0 && (
                <>
                    {/* Summary Cards with Costs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gray-800 p-4 rounded-lg border border-purple-500/30 relative overflow-hidden">
                            <h3 className="text-xs font-bold text-purple-400 uppercase">Reasoning Engines</h3>
                            <p className="text-3xl font-bold text-white mt-1">{aggregatedStats.re.count}</p>
                            <p className="text-xs text-gray-500 mt-1">Resources</p>
                            {aggregatedStats.re.cost > 0 && (
                                <div className="absolute top-4 right-4 text-right">
                                    <p className="text-lg font-bold text-green-400">{formatMoney(aggregatedStats.re.cost, currency)}</p>
                                    <p className="text-[10px] text-gray-500">Total Billed</p>
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-blue-500/30 relative overflow-hidden">
                            <h3 className="text-xs font-bold text-blue-400 uppercase">Vertex AI Apps</h3>
                            <p className="text-3xl font-bold text-white mt-1">{aggregatedStats.vertexApp.count}</p>
                            <p className="text-xs text-gray-500 mt-1">Search Apps</p>
                            {aggregatedStats.vertexApp.cost > 0 && (
                                <div className="absolute top-4 right-4 text-right">
                                    <p className="text-lg font-bold text-green-400">{formatMoney(aggregatedStats.vertexApp.cost, currency)}</p>
                                    <p className="text-[10px] text-gray-500">Total Billed</p>
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-cyan-500/30 relative overflow-hidden">
                            <h3 className="text-xs font-bold text-cyan-400 uppercase">Data Stores</h3>
                            <p className="text-3xl font-bold text-white mt-1">{aggregatedStats.dataStore.count}</p>
                            <p className="text-xs text-gray-500 mt-1">Indices</p>
                            {aggregatedStats.dataStore.cost > 0 && (
                                <div className="absolute top-4 right-4 text-right">
                                    <p className="text-lg font-bold text-green-400">{formatMoney(aggregatedStats.dataStore.cost, currency)}</p>
                                    <p className="text-[10px] text-gray-500">Total Billed</p>
                                </div>
                            )}
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg border border-teal-500/30 relative overflow-hidden">
                            <h3 className="text-xs font-bold text-teal-400 uppercase">Cloud Run</h3>
                            <p className="text-3xl font-bold text-white mt-1">{aggregatedStats.cloudRun.count}</p>
                            <p className="text-xs text-gray-500 mt-1">Services</p>
                            {aggregatedStats.cloudRun.cost > 0 && (
                                <div className="absolute top-4 right-4 text-right">
                                    <p className="text-lg font-bold text-green-400">{formatMoney(aggregatedStats.cloudRun.cost, currency)}</p>
                                    <p className="text-[10px] text-gray-500">Total Billed</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Detailed List */}
                    <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">Resource Inventory & Cost Breakdown</h3>
                            <button 
                                onClick={handleFetchUsage} 
                                disabled={isFetchingUsage}
                                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 flex items-center gap-2 whitespace-nowrap"
                            >
                                {isFetchingUsage ? (
                                    <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                                        Fetching...
                                    </>
                                ) : '3. Fetch Usage Metrics (Required for Allocation)'}
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Resource Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Location</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Est. Requests (30d)</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Compute/Storage</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-green-400 uppercase">Est. Cost Share</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {resources.map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-700/30">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{r.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{r.type}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{r.location}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-mono">
                                                {formatUsage(r.usageRequestCount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-mono">
                                                {formatCompute(r.usageComputeStorage, r.type)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400 font-mono text-right font-bold">
                                                {formatMoney(r.estimatedCostShare, currency)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg">
                        <p className="text-sm text-yellow-200">
                            <strong>Note:</strong> Cost Shares are estimated by pro-rating the total actual bill for the service category (from BigQuery) based on the request volume metrics fetched from Cloud Monitoring. They are approximations for allocation purposes.
                        </p>
                    </div>
                </>
            )}

            {billingCosts.length > 0 && (
                <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-700 mt-6">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-indigo-900/20">
                        <h3 className="text-lg font-semibold text-white">Raw Billing Export (Last 30 Days)</h3>
                        <span className="text-xl font-bold text-green-400">{formatMoney(totalActualCost, currency)}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Service</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">SKU</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Cost ({currency})</th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {billingCosts.map((row, i) => (
                                    <tr key={i} className="hover:bg-gray-700/30">
                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-white">{row.service_name}</td>
                                        <td className="px-6 py-3 text-sm text-gray-400">{row.sku_name}</td>
                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-white text-right font-mono">{row.cost.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CostAssessmentPage;
