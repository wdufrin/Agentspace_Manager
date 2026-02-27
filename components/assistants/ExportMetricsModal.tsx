/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Config } from '../../types';
import * as api from '../../services/apiService';

interface ExportMetricsModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: Config;
}

const ExportMetricsModal: React.FC<ExportMetricsModalProps> = ({ isOpen, onClose, config }) => {
    const [datasetId, setDatasetId] = useState('');
    const [tableId, setTableId] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Selection State
    const [datasets, setDatasets] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
    const [isLoadingTables, setIsLoadingTables] = useState(false);

    // Creation State
    const [isCreationMode, setIsCreationMode] = useState(false);
    const [newDatasetId, setNewDatasetId] = useState('');
    const [newTableId, setNewTableId] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const bqLocation = config.appLocation === 'eu' ? 'EU' : 'US';

    const fetchDatasets = useCallback(async () => {
        setIsLoadingDatasets(true);
        setError(null);
        try {
            const res = await api.listBigQueryDatasets(config.projectId);
            // Filter datasets by location to ensure compatibility
            const validDatasets = (res.datasets || []).filter((d: any) => d.location === bqLocation);
            setDatasets(validDatasets);
            
            if (validDatasets.length === 0) {
                // If no valid datasets, suggest creation
                setIsCreationMode(true);
            }
        } catch (err: any) {
            console.error("Failed to list datasets", err);
            // Fallback to manual entry on error isn't strictly necessary but good UX
        } finally {
            setIsLoadingDatasets(false);
        }
    }, [config.projectId, bqLocation]);

    const fetchTables = useCallback(async (selectedDatasetId: string) => {
        if (!selectedDatasetId) {
            setTables([]);
            return;
        }
        setIsLoadingTables(true);
        try {
            const res = await api.listBigQueryTables(config.projectId, selectedDatasetId);
            setTables(res.tables || []);
        } catch (err: any) {
            console.error("Failed to list tables", err);
            setTables([]);
        } finally {
            setIsLoadingTables(false);
        }
    }, [config.projectId]);

    useEffect(() => {
        if (isOpen) {
            // Reset state on open
            setDatasetId('');
            setTableId('');
            setStatus(null);
            setError(null);
            setNewDatasetId('');
            setNewTableId('');
            setIsCreationMode(false);
            fetchDatasets();
        }
    }, [isOpen, fetchDatasets]);

    useEffect(() => {
        if (datasetId && !isCreationMode) {
            fetchTables(datasetId);
        } else {
            setTables([]);
        }
    }, [datasetId, isCreationMode, fetchTables]);

    const handleCreateResources = async () => {
        if (!newDatasetId && !newTableId) {
            setError("You must provide either a Dataset ID or a Table ID to create.");
            return;
        }

        setIsCreating(true);
        setError(null);
        setStatus("Creating resources...");

        try {
            // If the user wants to create a new dataset
            if (newDatasetId) {
                try {
                    await api.createBigQueryDataset(config.projectId, newDatasetId, bqLocation);
                    setStatus("Dataset created.");
                } catch (err: any) {
                    if (err.message && (err.message.includes("Already Exists") || err.message.includes("409"))) {
                        console.log("Dataset already exists, proceeding.");
                    } else {
                        throw new Error(`Failed to create dataset: ${err.message}`);
                    }
                }
            }

            const targetDataset = newDatasetId || datasetId;

            if (!targetDataset) {
                throw new Error("A dataset must be selected or created before creating a table.");
            }

            // If the user wants to create a new table
            if (newTableId) {
                setStatus("Creating table...");
                await api.createBigQueryTable(config.projectId, targetDataset, newTableId);
            }

            // Switch back to selection mode and refresh
            await fetchDatasets();
            if (newDatasetId) {
                setDatasetId(newDatasetId);
                await fetchTables(newDatasetId);
            } else if (datasetId) {
                await fetchTables(datasetId);
            }

            if (newTableId) setTableId(newTableId);

            setIsCreationMode(false);
            setStatus("Resources created successfully! Ready to export.");

        } catch (err: any) {
            setError(err.message || "Creation failed.");
            setStatus(null);
        } finally {
            setIsCreating(false);
        }
    };

    const handleExport = async () => {
        const targetDataset = datasetId;
        const targetTable = tableId;

        if (!targetDataset || !targetTable) {
            setError("Dataset ID and Table ID are required to export.");
            return;
        }
        setIsExporting(true);
        setError(null);
        setStatus("Initiating export...");

        try {
            const operation = await api.exportAnalyticsMetrics(config, targetDataset, targetTable);
            setStatus("Export initiated. Polling status...");
            
            let currentOperation = operation;
            while (!currentOperation.done) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                currentOperation = await api.getDiscoveryOperation(currentOperation.name, config, 'v1alpha');
                setStatus("Exporting metrics to BigQuery...");
            }

            if (currentOperation.error) {
                throw new Error(currentOperation.error.message);
            }

            setStatus("Success! Metrics exported to BigQuery.");
        } catch (err: any) {
            setError(err.message || "Export failed.");
            setStatus(null);
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-gray-700 font-sans">
                <h2 className="text-xl font-bold text-white mb-2">Backup Metrics to BigQuery</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Export analytics metrics to BigQuery. Target location: <strong className="text-white">{bqLocation}</strong>.
                </p>
                
                {isCreationMode ? (
                    <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700 mb-4 shadow-inner">
                        <h3 className="text-sm font-semibold text-white border-b border-gray-700 pb-2">Create New Resources</h3>
                        <p className="text-xs text-gray-400">Fill in one or both to create them in your project.</p>

                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">New Dataset ID</label>
                            <input 
                                type="text" 
                                value={newDatasetId} 
                                onChange={(e) => setNewDatasetId(e.target.value)} 
                                className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2.5 text-white text-sm transition-colors"
                                placeholder={datasetId ? `Leave blank to use '${datasetId}'` : "my_new_dataset"}
                                disabled={isCreating}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">New Table ID</label>
                            <input 
                                type="text" 
                                value={newTableId} 
                                onChange={(e) => setNewTableId(e.target.value)} 
                                className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2.5 text-white text-sm transition-colors"
                                placeholder="metrics_backup_v1"
                                disabled={isCreating}
                            />
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-800 mt-2">
                            <button 
                                onClick={() => setIsCreationMode(false)} 
                                className="text-xs text-gray-400 hover:text-white transition-colors"
                                disabled={isCreating}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleCreateResources} 
                                disabled={isCreating || (!newDatasetId && !newTableId)}
                                className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isCreating ? 'Creating...' : 'Create & Select'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">BigQuery Dataset</label>
                            <div className="flex gap-2 mt-1">
                                <select 
                                    value={datasetId} 
                                    onChange={(e) => setDatasetId(e.target.value)} 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                                    disabled={isLoadingDatasets || isExporting}
                                >
                                    <option value="">{isLoadingDatasets ? 'Loading...' : '-- Select Dataset --'}</option>
                                    {datasets.map(d => (
                                        <option key={d.datasetReference.datasetId} value={d.datasetReference.datasetId}>
                                            {d.datasetReference.datasetId}
                                        </option>
                                    ))}
                                </select>
                                    <button onClick={fetchDatasets} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 border border-gray-600 flex-shrink-0" title="Refresh Datasets">↻</button>
                                    <button onClick={() => { setIsCreationMode(true); setNewDatasetId(''); setNewTableId(''); }} className="px-3 py-2 bg-gray-700 hover:bg-teal-700 hover:text-white rounded text-teal-400 border border-gray-600 font-bold flex-shrink-0" title="Create New Dataset">+</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">BigQuery Table</label>
                            <div className="flex gap-2 mt-1">
                                <select 
                                    value={tableId} 
                                    onChange={(e) => setTableId(e.target.value)} 
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                                    disabled={!datasetId || isLoadingTables || isExporting}
                                >
                                    <option value="">{isLoadingTables ? 'Loading...' : '-- Select Table --'}</option>
                                    {tables.map(t => (
                                        <option key={t.tableReference.tableId} value={t.tableReference.tableId}>
                                            {t.tableReference.tableId}
                                        </option>
                                    ))}
                                </select>
                                    <button onClick={() => fetchTables(datasetId)} disabled={!datasetId} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 border border-gray-600 disabled:opacity-50 flex-shrink-0" title="Refresh Tables">↻</button>
                                    <button onClick={() => { setIsCreationMode(true); setNewDatasetId(''); setNewTableId(''); }} disabled={!datasetId} className="px-3 py-2 bg-gray-700 hover:bg-teal-700 hover:text-white rounded text-teal-400 border border-gray-600 disabled:opacity-50 font-bold flex-shrink-0" title="Create New Table">+</button>
                                </div>
                        </div>
                    </div>
                )}

                {error && <div className="p-3 bg-red-900/30 text-red-300 text-xs rounded-md border border-red-800 mb-3 whitespace-pre-wrap">{error}</div>}
                {status && <div className="p-3 bg-blue-900/30 text-blue-300 text-xs rounded-md border border-blue-800 mb-3">{status}</div>}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button onClick={onClose} disabled={isExporting || isCreating} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Close</button>
                    <button 
                        onClick={handleExport} 
                        disabled={isExporting || isCreating || isCreationMode} 
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center"
                    >
                        {isExporting && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>}
                        {isExporting ? 'Exporting...' : 'Export Metrics'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExportMetricsModal;
