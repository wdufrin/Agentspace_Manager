
import React, { useState, useEffect, useCallback } from 'react';
import { Config } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';

interface AnalyticsMetricsViewerProps {
    config: Config;
}

const AnalyticsMetricsViewer: React.FC<AnalyticsMetricsViewerProps> = ({ config }) => {
    const [datasets, setDatasets] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [selectedDataset, setSelectedDataset] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    
    const [queryResults, setQueryResults] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch Datasets on Mount
    useEffect(() => {
        const fetchDatasets = async () => {
            if (!config.projectId) return;
            try {
                const res = await api.listBigQueryDatasets(config.projectId);
                setDatasets(res.datasets || []);
            } catch (e) {
                console.error("Failed to load datasets", e);
            }
        };
        fetchDatasets();
    }, [config.projectId]);

    // Fetch Tables when Dataset changes
    useEffect(() => {
        const fetchTables = async () => {
            if (!selectedDataset || !config.projectId) {
                setTables([]);
                return;
            }
            try {
                const res = await api.listBigQueryTables(config.projectId, selectedDataset);
                setTables(res.tables || []);
            } catch (e) {
                console.error("Failed to load tables", e);
                setTables([]);
            }
        };
        fetchTables();
    }, [selectedDataset, config.projectId]);

    const handleRunQuery = useCallback(async () => {
        if (!selectedDataset || !selectedTable) return;
        
        setIsLoading(true);
        setError(null);
        setQueryResults(null);

        const query = `SELECT * FROM \`${config.projectId}.${selectedDataset}.${selectedTable}\` LIMIT 50`;

        try {
            const result = await api.runBigQueryQuery(config.projectId, query);
            setQueryResults(result);
        } catch (err: any) {
            setError(err.message || "Failed to run query.");
        } finally {
            setIsLoading(false);
        }
    }, [config.projectId, selectedDataset, selectedTable]);

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 flex flex-col h-full border border-gray-700 mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Analytics Metrics (BigQuery)</h2>
            </div>

            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Dataset</label>
                        <select 
                            value={selectedDataset} 
                            onChange={(e) => { setSelectedDataset(e.target.value); setSelectedTable(''); }}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                        >
                            <option value="">-- Select Dataset --</option>
                            {datasets.map(d => (
                                <option key={d.datasetReference.datasetId} value={d.datasetReference.datasetId}>
                                    {d.datasetReference.datasetId}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Table</label>
                        <select 
                            value={selectedTable} 
                            onChange={(e) => setSelectedTable(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            disabled={!selectedDataset}
                        >
                            <option value="">-- Select Table --</option>
                            {tables.map(t => (
                                <option key={t.tableReference.tableId} value={t.tableReference.tableId}>
                                    {t.tableReference.tableId}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button 
                        onClick={handleRunQuery} 
                        disabled={isLoading || !selectedTable}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed h-[40px]"
                    >
                        {isLoading ? 'Running...' : 'View Metrics'}
                    </button>
                </div>
            </div>

            {error && <div className="p-4 bg-red-900/20 text-red-300 rounded-lg border border-red-800 mb-4">{error}</div>}

            {isLoading && <div className="p-8"><Spinner /></div>}

            {queryResults && (
                <div className="flex-1 overflow-auto border border-gray-700 rounded-lg bg-gray-900">
                    <table className="min-w-full divide-y divide-gray-700 text-sm text-left">
                        <thead className="bg-gray-800 text-gray-300 sticky top-0">
                            <tr>
                                {queryResults.schema.fields.map((field: any, i: number) => (
                                    <th key={i} className="px-4 py-3 font-medium whitespace-nowrap">{field.name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-200">
                            {queryResults.rows?.map((row: any, rIndex: number) => (
                                <tr key={rIndex} className="hover:bg-gray-800/50">
                                    {row.f.map((cell: any, cIndex: number) => (
                                        <td key={cIndex} className="px-4 py-2 whitespace-nowrap max-w-xs truncate" title={String(cell.v)}>
                                            {String(cell.v)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {(!queryResults.rows || queryResults.rows.length === 0) && (
                                <tr>
                                    <td colSpan={queryResults.schema.fields.length} className="px-4 py-8 text-center text-gray-500">
                                        No data found in this table (Limit 50).
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AnalyticsMetricsViewer;
