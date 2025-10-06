import React, { useState, useMemo, useCallback } from 'react';
import { Config, LogEntry } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import ProjectInput from '../components/ProjectInput';

// --- Sub-Components ---

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
    const styles = {
        ERROR: 'bg-red-500 text-white',
        WARNING: 'bg-yellow-500 text-black',
        INFO: 'bg-blue-500 text-white',
        DEFAULT: 'bg-gray-500 text-white',
    };
    const style = styles[severity as keyof typeof styles] || styles.DEFAULT;
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${style}`}>{severity}</span>;
};

const getTriggeredFilter = (filterResults: any): { name: string, confidence?: string } | null => {
    if (!filterResults) return null;
    for (const filterName in filterResults) {
        const result = filterResults[filterName];
        // The structure is nested, e.g., { piAndJailbreakFilterResult: { matchState: '...' } }
        const filterResultKey = Object.keys(result)[0];
        if (result[filterResultKey]?.matchState === 'MATCH_FOUND') {
            return {
                name: filterName,
                confidence: result[filterResultKey]?.confidenceLevel,
            };
        }
    }
    return null;
}

const parseAssistantFromCorrelationId = (correlationId: string): string => {
    if (!correlationId || !correlationId.startsWith('AS|')) {
        return 'N/A';
    }
    try {
        const parts = correlationId.split('|');
        if (parts.length > 1 && parts[1].startsWith('projects/')) {
            const path = parts[1];
            const pathParts = path.split('/');
            // Expects .../engines/{engine_id}/assistants/{assistant_id}
            const assistantIndex = pathParts.indexOf('assistants');
            if (assistantIndex > 0 && assistantIndex < pathParts.length - 1) {
                const engineId = pathParts[assistantIndex - 1];
                const assistantId = pathParts[assistantIndex + 1];
                return `${engineId} / ${assistantId}`;
            }
            return path; // Fallback to full path if parsing fails
        }
    } catch (e) {
        // Fallthrough to return N/A
    }
    return 'N/A';
};


const LogEntryCard: React.FC<{ log: LogEntry }> = ({ log }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const payload = log.jsonPayload;
    const sanitizationResult = payload?.sanitizationResult;
    const triggeredFilter = getTriggeredFilter(sanitizationResult?.filterResults);
    
    const correlationId = log.labels?.['modelarmor.googleapis.com/client_correlation_id'] || '';
    const sourceAssistant = parseAssistantFromCorrelationId(correlationId);

    return (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
            <header className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-700/50" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-4">
                     <SeverityBadge severity={log.severity} />
                     <span className="text-sm font-mono text-gray-300">{new Date(log.receiveTimestamp).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400" title={correlationId}>Source Assistant: {sourceAssistant}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </div>
            </header>
            
            <div className="p-4 border-t border-gray-700 space-y-2">
                 <p className="text-sm text-white">
                    <span className="font-semibold text-red-400">Verdict:</span> {sanitizationResult?.sanitizationVerdict || 'N/A'}
                </p>
                {triggeredFilter && (
                     <p className="text-sm text-white">
                        <span className="font-semibold text-yellow-400">Triggered Filter:</span> {triggeredFilter.name}
                        {triggeredFilter.confidence && <span className="text-xs text-gray-400"> (Confidence: {triggeredFilter.confidence})</span>}
                    </p>
                )}
                 <p className="text-sm text-gray-300">
                    <span className="font-semibold">Reason:</span> {sanitizationResult?.sanitizationVerdictReason || 'No reason provided.'}
                </p>
                <div className="pt-2">
                    <label className="text-xs font-semibold text-gray-400">Input Text</label>
                    <p className="text-sm text-gray-200 bg-gray-800 p-2 mt-1 rounded-md font-mono">{payload?.sanitizationInput?.text || 'Not available.'}</p>
                </div>
            </div>

            {isExpanded && (
                <div className="bg-gray-900 p-4 border-t border-gray-700">
                    <h4 className="text-md font-semibold text-white mb-2">Full Log Payload</h4>
                    <pre className="text-xs text-gray-200 whitespace-pre-wrap break-all max-h-96 overflow-y-auto bg-black p-2 rounded">
                        <code>{JSON.stringify(log.jsonPayload, null, 2)}</code>
                    </pre>
                </div>
            )}
        </div>
    );
};


// --- Main Page Component ---

const ModelArmorPage: React.FC<{ accessToken: string; projectNumber: string; setProjectNumber: (projectNumber: string) => void; }> = ({ accessToken, projectNumber, setProjectNumber }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const apiConfig: Config = useMemo(() => ({
      accessToken,
      projectId: projectNumber,
      // Dummy values, not used for logging API but required by type
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
  }), [accessToken, projectNumber]);
  
  const handleFetchLogs = useCallback(async () => {
    if (!accessToken || !projectNumber) {
        setError("Access Token and Project ID are required to fetch logs.");
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setLogs([]);

    try {
      const response = await api.fetchViolationLogs(apiConfig, filterText);
      setLogs(response.entries || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch violation logs.');
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, filterText, accessToken, projectNumber]);
  
  const renderContent = () => {
    if (!accessToken || !projectNumber) {
        return <div className="text-center text-gray-400 mt-8">Please set your GCP Access Token and Project ID to begin.</div>;
    }
    if (isLoading) return <Spinner />;

    return (
        <div className="mt-6 space-y-4">
            {logs.length > 0 ? (
                logs.map((log, index) => <LogEntryCard key={`${log.logName}-${log.receiveTimestamp}-${index}`} log={log} />)
            ) : (
                <div className="text-center text-gray-400 mt-8 p-6 bg-gray-800 rounded-lg">
                    <h3 className="text-lg font-semibold text-white">No Violation Logs Found</h3>
                    <p>No logs matching the filter were found. Try adjusting your filter or ensure that violation events have occurred.</p>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold text-white mb-3">Model Armor - Violation Logs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <ProjectInput value={projectNumber} onChange={setProjectNumber} accessToken={accessToken} />
            </div>
            <div>
                 <label htmlFor="filterText" className="block text-sm font-medium text-gray-400 mb-1">Additional Filter (Optional)</label>
                 <input
                    type="text"
                    id="filterText"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder='e.g., labels."modelarmor.googleapis.com/operation_type"="SANITIZE_PROMPT"'
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]"
                 />
            </div>
             <div className="flex items-end">
                <button 
                    onClick={handleFetchLogs} 
                    disabled={isLoading || !projectNumber}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                >
                    {isLoading ? 'Fetching...' : 'Fetch Logs'}
                </button>
             </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
            This tool queries Cloud Logging for <code className="bg-gray-700 p-1 rounded text-xs">log_id("modelarmor.googleapis.com/sanitize_operations")</code>.
        </p>
      </div>

      {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
      
      {renderContent()}
    </div>
  );
};

export default ModelArmorPage;