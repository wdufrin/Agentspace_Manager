import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Config, DataStore, Document } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';

interface DataStoreQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    dataStore: DataStore;
    config: Config;
}

interface SearchResultItem {
    id: string;
    document: Document;
}

interface QueryHistoryEntry {
    query: string;
    results: SearchResultItem[];
    totalSize?: number;
    error?: string;
    timestamp: Date;
}

type CodeLanguage = 'python' | 'curl' | 'nodejs' | 'rest';

const CodeBlock: React.FC<{ content: string; language?: string }> = ({ content, language }) => {
    const [copyText, setCopyText] = useState('Copy');

    const handleCopy = () => {
        navigator.clipboard.writeText(content).then(() => {
            setCopyText('Copied!');
            setTimeout(() => setCopyText('Copy'), 2000);
        });
    };

    return (
        <div className="bg-gray-950 rounded-lg overflow-hidden relative group border border-gray-700">
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-700">
                {language && <span className="text-xs text-gray-500 font-mono">{language}</span>}
                <button
                    onClick={handleCopy}
                    className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs font-semibold rounded hover:bg-gray-600 hover:text-white transition-colors ml-auto"
                >
                    {copyText}
                </button>
            </div>
            <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-[50vh]">
                <code>{content}</code>
            </pre>
        </div>
    );
};

const DataStoreQueryModal: React.FC<DataStoreQueryModalProps> = ({ isOpen, onClose, dataStore, config }) => {
    const [query, setQuery] = useState('');
    const [pageSize, setPageSize] = useState(10);
    const [isSearching, setIsSearching] = useState(false);
    const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
    const [expandedResult, setExpandedResult] = useState<string | null>(null);
    const [showCodePanel, setShowCodePanel] = useState(false);
    const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>('python');
    const resultsEndRef = useRef<HTMLDivElement>(null);

    const dataStoreId = dataStore.name.split('/').pop() || '';

    // Extract project/location from the data store resource name
    // Format: projects/{project}/locations/{location}/collections/{collection}/dataStores/{id}
    const nameParts = dataStore.name.split('/');
    const projectId = config.projectId;
    const location = config.appLocation || 'global';

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setHistory([]);
            setExpandedResult(null);
        }
    }, [isOpen]);

    useEffect(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    // The query text used for code generation — use the input or the last submitted query
    const codeQuery = query.trim() || (history.length > 0 ? history[history.length - 1].query : 'your search query');

    const generatedCode = useMemo(() => {
        const servingConfig = `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/default_serving_config`;
        const baseUrl = location === 'global'
            ? 'https://discoveryengine.googleapis.com'
            : `https://${location}-discoveryengine.googleapis.com`;
        const apiUrl = `${baseUrl}/v1beta/${dataStore.name}/servingConfigs/default_serving_config:search`;

        const python = `from google.cloud import discoveryengine_v1beta

# Initialize the Search Service client
client = discoveryengine_v1beta.SearchServiceClient()

# Configuration
project = "${projectId}"
location = "${location}"
data_store = "${dataStoreId}"

serving_config = (
    f"projects/{project}/locations/{location}/collections/default_collection"
    f"/dataStores/{data_store}/servingConfigs/default_serving_config"
)

# Build the search request
search_request = discoveryengine_v1beta.SearchRequest(
    serving_config=serving_config,
    query="${codeQuery.replace(/"/g, '\\"')}",
    page_size=${pageSize},
)

# Perform the query
response = client.search(request=search_request)

# Process results
for page in response.pages:
    for result in page.results:
        print(f"Document ID: {result.document.id}")
        print(f"  Name: {result.document.name}")
        if result.document.derived_struct_data:
            print(f"  Data: {dict(result.document.derived_struct_data)}")
        print()`;

        const curl = `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '{
    "query": "${codeQuery.replace(/'/g, "\\'")}",
    "pageSize": ${pageSize}
  }' \\
  "${apiUrl}"`;

        const nodejs = `const { SearchServiceClient } = require("@google-cloud/discoveryengine").v1beta;

// Initialize the client
const client = new SearchServiceClient();

async function searchDataStore() {
  const project = "${projectId}";
  const location = "${location}";
  const dataStore = "${dataStoreId}";

  const servingConfig = \`projects/\${project}/locations/\${location}/collections/default_collection/dataStores/\${dataStore}/servingConfigs/default_serving_config\`;

  const request = {
    servingConfig,
    query: "${codeQuery.replace(/"/g, '\\"')}",
    pageSize: ${pageSize},
  };

  // Perform the search
  const [response] = await client.search(request);

  for (const result of response) {
    console.log("Document ID:", result.document.id);
    console.log("  Name:", result.document.name);
    if (result.document.structData) {
      console.log("  Data:", JSON.stringify(result.document.structData, null, 2));
    }
    console.log();
  }
}

searchDataStore().catch(console.error);`;

        const rest = `# REST API Details
# -----------------

# Endpoint (POST):
${apiUrl}

# Headers:
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
X-Goog-User-Project: ${projectId}

# Request Body:
${JSON.stringify({ query: codeQuery, pageSize }, null, 2)}

# Serving Config Resource Name:
${servingConfig}

# Data Store Resource Name:
${dataStore.name}`;

        return { python, curl, nodejs, rest };
    }, [projectId, location, dataStoreId, dataStore.name, codeQuery, pageSize]);

    if (!isOpen) return null;

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;

        const currentQuery = query;
        setIsSearching(true);

        try {
            const response = await api.queryDataStore(
                dataStore.name,
                config,
                currentQuery,
                pageSize,
            );

            setHistory(prev => [...prev, {
                query: currentQuery,
                results: response.results || [],
                totalSize: response.totalSize,
                timestamp: new Date(),
            }]);
        } catch (err: any) {
            setHistory(prev => [...prev, {
                query: currentQuery,
                results: [],
                error: err.message || 'Search failed.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsSearching(false);
            setQuery('');
        }
    };

    const toggleExpandResult = (resultId: string) => {
        setExpandedResult(prev => prev === resultId ? null : resultId);
    };

    const getDocumentPreview = (doc: Document): string => {
        if (doc.structData) {
            return JSON.stringify(doc.structData, null, 2);
        }
        if (doc.jsonData) {
            try {
                return JSON.stringify(JSON.parse(doc.jsonData), null, 2);
            } catch {
                return doc.jsonData;
            }
        }
        if (doc.content?.uri) {
            return `Source: ${doc.content.uri}`;
        }
        return 'No preview available.';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
                {/* Header */}
                <header className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Query Data Store
                        </h2>
                        <p className="text-sm text-gray-400 mt-1 font-mono">{dataStoreId}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowCodePanel(prev => !prev)}
                            className={`px-3 py-1.5 text-sm font-semibold rounded-md flex items-center gap-1.5 transition-colors ${showCodePanel ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}`}
                            title="View exportable code snippets"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                            {showCodePanel ? 'Hide Code' : 'View Code'}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                    </div>
                </header>

                {/* Settings Bar */}
                <div className="px-4 py-2 border-b border-gray-700 bg-gray-900/50 flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                        <label htmlFor="pageSize" className="text-sm text-gray-400">Results per query:</label>
                        <select
                            id="pageSize"
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="bg-gray-700 border-gray-600 rounded-md text-sm text-gray-200 h-8 px-2"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                    <div className="text-xs text-gray-500 ml-auto">
                        Serving Config: <span className="font-mono text-gray-400">default_serving_config</span>
                    </div>
                </div>

                {/* Main Content Area — splits between results and code panel */}
                <div className={`flex-1 overflow-hidden flex ${showCodePanel ? 'divide-x divide-gray-700' : ''}`}>
                    {/* Results Area */}
                    <main className={`overflow-y-auto p-4 space-y-6 ${showCodePanel ? 'w-1/2' : 'w-full'}`}>
                    {history.length === 0 && !isSearching && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <p className="text-lg">Enter a query to search this data store</p>
                            <p className="text-sm">Results from the Discovery Engine Search API will appear here.</p>
                        </div>
                    )}

                    {history.map((entry, historyIdx) => (
                        <div key={historyIdx} className="space-y-3">
                            {/* User Query Bubble */}
                            <div className="flex justify-end">
                                <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-lg">
                                    <p className="text-sm whitespace-pre-wrap">{entry.query}</p>
                                    <p className="text-xs text-blue-200 mt-1 text-right">{entry.timestamp.toLocaleTimeString()}</p>
                                </div>
                            </div>

                            {/* Results */}
                            <div className="flex justify-start">
                                <div className="bg-gray-700 rounded-lg max-w-3xl w-full">
                                    {entry.error ? (
                                        <div className="p-4 text-red-400 text-sm">
                                            <p className="font-semibold">Search Error</p>
                                            <p className="mt-1">{entry.error}</p>
                                        </div>
                                    ) : entry.results.length === 0 ? (
                                        <div className="p-4 text-gray-400 text-sm text-center">
                                            No results found for this query.
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="px-4 py-2 border-b border-gray-600 flex justify-between items-center">
                                                <span className="text-sm text-gray-300 font-semibold">
                                                    {entry.results.length} result{entry.results.length !== 1 ? 's' : ''}
                                                    {entry.totalSize != null ? ` (of ${entry.totalSize} total)` : ''}
                                                </span>
                                            </div>
                                            <div className="divide-y divide-gray-600">
                                                {entry.results.map((result, resultIdx) => {
                                                    const docId = result.document?.id || result.id || `${historyIdx}-${resultIdx}`;
                                                    const uniqueKey = `${historyIdx}-${docId}`;
                                                    const isExpanded = expandedResult === uniqueKey;

                                                    return (
                                                        <div key={uniqueKey} className="px-4 py-3">
                                                            <button
                                                                onClick={() => toggleExpandResult(uniqueKey)}
                                                                className="w-full text-left flex items-start justify-between gap-2 group"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded font-mono shrink-0">
                                                                            #{resultIdx + 1}
                                                                        </span>
                                                                        <p className="text-sm text-white font-medium truncate">
                                                                            {result.document?.displayName || result.document?.id || docId}
                                                                        </p>
                                                                    </div>
                                                                    {result.document?.content?.uri && (
                                                                        <p className="text-xs text-gray-400 mt-1 truncate font-mono">
                                                                            {result.document.content.uri}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <svg
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    className={`h-5 w-5 text-gray-400 group-hover:text-white transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                                                    viewBox="0 0 20 20"
                                                                    fill="currentColor"
                                                                >
                                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>

                                                            {isExpanded && (
                                                                <div className="mt-3 bg-gray-800 rounded-md p-3 border border-gray-600">
                                                                    <div className="space-y-2">
                                                                        <div>
                                                                            <span className="text-xs font-medium text-gray-400">Document Name:</span>
                                                                            <p className="text-xs text-gray-300 font-mono break-all">{result.document?.name || 'N/A'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-xs font-medium text-gray-400">Content:</span>
                                                                            <pre className="text-xs text-gray-300 mt-1 bg-gray-900 p-2 rounded overflow-auto max-h-60 whitespace-pre-wrap">
                                                                                {getDocumentPreview(result.document)}
                                                                            </pre>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isSearching && (
                        <div className="flex justify-start">
                            <div className="bg-gray-700 rounded-lg px-6 py-4">
                                <div className="flex items-center space-x-3">
                                    <Spinner />
                                    <span className="text-sm text-gray-300">Searching...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={resultsEndRef} />
                </main>

                    {/* Code Panel */}
                    {showCodePanel && (
                        <div className="w-1/2 overflow-y-auto p-4 bg-gray-900/30">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Export Code</h3>
                                    <p className="text-xs text-gray-400">
                                        Copy these code snippets to query this data store from your own application.
                                        The code updates live as you change the query and settings.
                                    </p>
                                </div>

                                {/* Language Tabs */}
                                <div className="flex border-b border-gray-600">
                                    {([
                                        { key: 'python' as CodeLanguage, label: 'Python' },
                                        { key: 'curl' as CodeLanguage, label: 'cURL' },
                                        { key: 'nodejs' as CodeLanguage, label: 'Node.js' },
                                        { key: 'rest' as CodeLanguage, label: 'REST' },
                                    ]).map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setCodeLanguage(tab.key)}
                                            className={`px-4 py-2 text-sm font-medium transition-colors ${codeLanguage === tab.key
                                                ? 'border-b-2 border-blue-500 text-white'
                                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Setup Instructions */}
                                {codeLanguage === 'python' && (
                                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-1">
                                        <p className="text-xs font-semibold text-gray-300">Prerequisites:</p>
                                        <CodeBlock 
                                            content="pip install google-cloud-discoveryengine" 
                                            language="bash" 
                                        />
                                        <p className="text-xs text-gray-400 mt-2">
                                            Ensure you're authenticated via <span className="font-mono text-gray-300">gcloud auth application-default login</span> or 
                                            have <span className="font-mono text-gray-300">GOOGLE_APPLICATION_CREDENTIALS</span> set.
                                        </p>
                                    </div>
                                )}
                                {codeLanguage === 'nodejs' && (
                                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-1">
                                        <p className="text-xs font-semibold text-gray-300">Prerequisites:</p>
                                        <CodeBlock 
                                            content="npm install @google-cloud/discoveryengine" 
                                            language="bash" 
                                        />
                                    </div>
                                )}
                                {codeLanguage === 'curl' && (
                                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3">
                                        <p className="text-xs text-gray-400">
                                            Requires <span className="font-mono text-gray-300">gcloud</span> CLI installed and authenticated.
                                        </p>
                                    </div>
                                )}

                                {/* The Code */}
                                <CodeBlock
                                    content={generatedCode[codeLanguage]}
                                    language={
                                        codeLanguage === 'python' ? 'python'
                                        : codeLanguage === 'curl' ? 'bash'
                                        : codeLanguage === 'nodejs' ? 'javascript'
                                        : 'text'
                                    }
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <footer className="p-4 border-t border-gray-700 shrink-0">
                    <form onSubmit={handleSearch} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Enter your search query..."
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                            disabled={isSearching}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={isSearching || !query.trim()}
                            className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Search
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    );
};

export default DataStoreQueryModal;
