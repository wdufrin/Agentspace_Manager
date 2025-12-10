
import React, { useState, useMemo, useCallback } from 'react';
import { Config, LogEntry } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import ProjectInput from '../components/ProjectInput';

// --- Icons ---

const ShieldIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

// --- Sub-Components ---

const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
    const isBlocked = verdict === 'BLOCKED' || verdict === 'MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK';
    const isAllowed = verdict === 'ALLOWED';
    
    let colorClass = 'bg-gray-700 text-gray-300 border-gray-600';
    let icon = null;

    if (isBlocked) {
        colorClass = 'bg-red-900/50 text-red-200 border-red-800';
        icon = (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
        );
    } else if (isAllowed) {
        colorClass = 'bg-green-900/50 text-green-200 border-green-800';
        icon = (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
        );
    }

    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center ${colorClass}`}>
            {icon}
            {verdict}
        </span>
    );
};

const getTriggeredFilter = (filterResults: any): { name: string, confidence?: string } | null => {
    if (!filterResults) return null;
    for (const filterName in filterResults) {
        const result = filterResults[filterName];
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
            const assistantIndex = pathParts.indexOf('assistants');
            if (assistantIndex > 0 && assistantIndex < pathParts.length - 1) {
                const engineId = pathParts[assistantIndex - 1];
                const assistantId = pathParts[assistantIndex + 1];
                return `${engineId} / ${assistantId}`;
            }
            return path;
        }
    } catch (e) {
        // Fallthrough
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

    const verdict = sanitizationResult?.sanitizationVerdict || 'N/A';

    return (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-sm transition-all hover:border-gray-600">
            {/* Header */}
            <div className="p-4 bg-gray-800 border-b border-gray-700/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-700">
                        {new Date(log.receiveTimestamp).toLocaleString()}
                    </span>
                    <span className="text-sm font-medium text-white" title={correlationId}>{sourceAssistant}</span>
                </div>
                <div className="flex items-center gap-3">
                    <VerdictBadge verdict={verdict} />
                    <button className="text-gray-500 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
            
            {/* Body */}
            <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    {/* Triggered Filter Info */}
                    {triggeredFilter && (
                        <div className="bg-red-900/10 border border-red-900/30 rounded-md p-3">
                            <p className="text-xs font-bold text-red-300 uppercase mb-1">Triggered Filter</p>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-white font-medium">{triggeredFilter.name}</span>
                                {triggeredFilter.confidence && (
                                    <span className="text-xs text-red-200 bg-red-900/40 px-2 py-0.5 rounded">
                                        Confidence: {triggeredFilter.confidence}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Explanation */}
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Reason</p>
                        <p className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded border border-gray-700/50">
                            {sanitizationResult?.sanitizationVerdictReason || 'No detailed reason provided.'}
                        </p>
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">Sanitized Input</p>
                    <div className="bg-gray-900 p-3 rounded-md border border-gray-700/50 max-h-32 overflow-y-auto text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
                        {payload?.sanitizationInput?.text || <span className="text-gray-600 italic">No input text available</span>}
                    </div>
                </div>
            </div>

            {/* JSON Expandable */}
            {isExpanded && (
                <div className="bg-black p-4 border-t border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase">Raw Log Payload</h4>
                        <button 
                            className="text-xs text-blue-400 hover:text-white"
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(JSON.stringify(log.jsonPayload, null, 2)); }}
                        >
                            Copy JSON
                        </button>
                    </div>
                    <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-96">
                        {JSON.stringify(log.jsonPayload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};


// --- Main Page Component ---

const ModelArmorPage: React.FC<{ projectNumber: string; setProjectNumber: (projectNumber: string) => void; }> = ({ projectNumber, setProjectNumber }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState(7);
  const [activeTab, setActiveTab] = useState<'logs' | 'policies'>('logs');

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      // Dummy values, not used for logging API but required by type
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
  }), [projectNumber]);
  
  const handleFetchLogs = useCallback(async () => {
    if (!projectNumber) {
        setError("Project ID is required to fetch logs.");
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setLogs([]);

    const filters = [];
    if (filterBlockedOnly) {
        filters.push(`(jsonPayload.sanitizationResult.sanitizationVerdict="BLOCKED" OR jsonPayload.sanitizationResult.sanitizationVerdict="MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK")`);
    }
    if (filterText.trim()) {
        filters.push(`(${filterText.trim()})`);
    }
    
    // Add date range filter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysFilter);
    filters.push(`timestamp >= "${cutoffDate.toISOString()}"`);

    const combinedCustomFilter = filters.join(' AND ');

    try {
      const response = await api.fetchViolationLogs(apiConfig, combinedCustomFilter);
      setLogs(response.entries || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch violation logs.');
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, filterText, projectNumber, filterBlockedOnly, daysFilter]);
  
  const renderContent = () => {
    if (!projectNumber) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-lg border border-gray-700 border-dashed mt-4">
                <ShieldIcon />
                <p className="text-gray-400 mt-2">Please set your Project ID to view logs.</p>
            </div>
        );
    }
    
    if (isLoading) return <div className="mt-8"><Spinner /></div>;

    return (
        <div className="mt-6 space-y-4">
            {logs.length > 0 ? (
                logs.map((log, index) => <LogEntryCard key={`${log.logName}-${log.receiveTimestamp}-${index}`} log={log} />)
            ) : (
                <div className="text-center text-gray-400 mt-8 p-12 bg-gray-800 rounded-lg border border-gray-700">
                    <ShieldIcon />
                    <h3 className="text-lg font-semibold text-white mt-2">No Logs Found</h3>
                    <p className="max-w-md mx-auto mt-1 text-sm">
                        No violation logs matched your criteria. Try adjusting your filters or ensure Model Armor is active on your resources.
                    </p>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="space-y-4">
        {/* Header & Main Controls */}
        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 border-b border-gray-700 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <ShieldIcon />
                        Model Armor Logs
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">Inspect content safety violation events from Cloud Logging.</p>
                </div>
                <div className="w-full md:w-auto">
                     <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Target Project</label>
                     <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Search Filters</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </div>
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder='e.g. jsonPayload.sanitizationResult.verdict="BLOCKED"'
                            className="pl-10 block w-full bg-gray-900 border border-gray-600 rounded-md py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 h-[38px]"
                        />
                    </div>
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                     <div className="flex flex-col min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-400 mb-1">Time Range</label>
                        <select
                            value={daysFilter}
                            onChange={(e) => setDaysFilter(Number(e.target.value))}
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 h-[38px]"
                        >
                            <option value={1}>Last 24 Hours</option>
                            <option value={3}>Last 3 Days</option>
                            <option value={7}>Last 7 Days</option>
                            <option value={30}>Last 30 Days</option>
                        </select>
                    </div>

                    <div className="flex items-center h-[38px] mt-auto">
                         <label className="flex items-center cursor-pointer gap-2 px-3 py-2 bg-gray-700/50 rounded-md border border-gray-600 hover:bg-gray-700 transition-colors h-full">
                            <input 
                                type="checkbox" 
                                checked={filterBlockedOnly} 
                                onChange={() => setFilterBlockedOnly(!filterBlockedOnly)} 
                                className="w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 bg-gray-800"
                            />
                            <span className="text-sm text-gray-300 select-none">Blocked Only</span>
                        </label>
                    </div>

                    <button 
                        onClick={handleFetchLogs} 
                        disabled={isLoading || !projectNumber}
                        className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg transition-all h-[38px] flex items-center justify-center min-w-[100px]"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : 'Fetch Logs'}
                    </button>
                </div>
            </div>
            
            <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center gap-2 text-xs text-gray-500">
                <InfoIcon />
                <span>Querying: <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-400 border border-gray-700">resource.type="modelarmor.googleapis.com/SanitizeOperation"</code></span>
            </div>
        </div>

        {/* Content Area with Tabs */}
        <div>
            <div className="flex border-b border-gray-700 mb-4">
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs' ? 'text-blue-400 border-blue-400' : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'}`}
                >
                    Activity Logs
                </button>
                <button 
                    disabled 
                    className="px-4 py-2 text-sm font-medium text-gray-600 border-b-2 border-transparent cursor-not-allowed"
                    title="Feature coming soon"
                >
                    Policies (Coming Soon)
                </button>
            </div>

            {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg border border-red-800/50">{error}</div>}
            
            {activeTab === 'logs' && renderContent()}
        </div>
    </div>
  );
};

export default ModelArmorPage;
