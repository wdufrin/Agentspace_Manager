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
        if (!newDatasetId || !newTableId) {
            setError("Both Dataset ID and Table ID are required.");
            return;
        }
        setIsCreating(true);
        setError(null);
        setStatus("Creating resources...");

        try {
            // 1. Create Dataset (ignore if exists)
            try {
                await api.createBigQueryDataset(config.projectId, newDatasetId, bqLocation);
                setStatus("Dataset created. Creating table...");
            } catch (err: any) {
                if (err.message && (err.message.includes("Already Exists") || err.message.includes("409"))) {
                    console.log("Dataset already exists, proceeding to table creation.");
                } else {
                    throw new Error(`Failed to create dataset: ${err.message}`);
                }
            }

            // 2. Create Table
            await api.createBigQueryTable(config.projectId, newDatasetId, newTableId);
            
            // 3. Switch back to selection mode with new values
            await fetchDatasets();
            setDatasetId(newDatasetId);
            setTableId(newTableId); // Ideally fetchTables would happen via useEffect, but we set it here to be safe
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
        const targetDataset = isCreationMode ? newDatasetId : datasetId;
        const targetTable = isCreationMode ? newTableId : tableId;

        if (!targetDataset || !targetTable) {
            setError("Dataset ID and Table ID are required.");
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
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-2">Backup Metrics to BigQuery</h2>
                <p className="text-sm text-gray-400 mb-4">
                    Export analytics metrics for the past 30 days. Target location: <strong className="text-white">{bqLocation}</strong> (based on your app location).
                </p>
                
                {isCreationMode ? (
                    <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700 mb-4">
                        <h3 className="text-sm font-semibold text-white">Create New Resources</h3>
                        <div>
                            <label className="block text-xs font-medium text-gray-400">New Dataset ID</label>
                            <input 
                                type="text" 
                                value={newDatasetId} 
                                onChange={(e) => setNewDatasetId(e.target.value)} 
                                className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                                placeholder="my_new_dataset"
                                disabled={isCreating}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400">New Table ID</label>
                            <input 
                                type="text" 
                                value={newTableId} 
                                onChange={(e) => setNewTableId(e.target.value)} 
                                className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                                placeholder="metrics_backup_v1"
                                disabled={isCreating}
                            />
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <button 
                                onClick={() => setIsCreationMode(false)} 
                                className="text-xs text-blue-400 hover:text-blue-300 underline"
                                disabled={isCreating}
                            >
                                Cancel / Select Existing
                            </button>
                            <button 
                                onClick={handleCreateResources} 
                                disabled={isCreating} 
                                className="px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-md hover:bg-teal-700 disabled:bg-gray-600"
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
                                <button onClick={fetchDatasets} className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 border border-gray-600" title="Refresh Datasets">↻</button>
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
                                <button onClick={() => fetchTables(datasetId)} disabled={!datasetId} className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 border border-gray-600" title="Refresh Tables">↻</button>
                            </div>
                        </div>
                        <div className="text-right">
                            <button 
                                onClick={() => setIsCreationMode(true)} 
                                className="text-xs text-teal-400 hover:text-teal-300 font-medium"
                            >
                                + Create New Dataset & Table
                            </button>
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
