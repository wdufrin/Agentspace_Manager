
import React, { useState, useEffect, useMemo } from 'react';
import { CloudRunService, Config, EnvVar } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';

interface CloudRunAgentsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const CodeBlock: React.FC<{ content: string; onCopy: () => void; copyText: string; title: string; }> = ({ content, onCopy, copyText, title }) => (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex justify-between items-center p-2 bg-gray-900/50">
            <span className="text-sm font-semibold text-gray-300">{title}</span>
            <button
                onClick={onCopy}
                className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500"
            >
                {copyText}
            </button>
        </div>
        <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
            <code>{content}</code>
        </pre>
    </div>
);

// --- Analysis Logic ---

interface AgentAnalysis {
    isAgent: boolean;
    confidence: 'High' | 'Medium' | 'Low' | 'None';
    reasons: string[];
    score: number;
    agentName?: string;
    agentDescription?: string;
    model?: string;
}

const analyzeService = (service: CloudRunService): AgentAnalysis => {
    let score = 0;
    const reasons: string[] = [];
    const envVars = service.template?.containers?.[0]?.env || [];
    const labels = service.labels || {};
    
    const getEnv = (name: string) => envVars.find(e => e.name === name)?.value;

    const agentName = getEnv('AGENT_DISPLAY_NAME');
    const agentDesc = getEnv('AGENT_DESCRIPTION');
    const model = getEnv('MODEL');
    const agentUrl = getEnv('AGENT_URL');
    const vertexAi = getEnv('GOOGLE_GENAI_USE_VERTEXAI');

    // Heuristics
    if (agentName) { score += 3; reasons.push("Has AGENT_DISPLAY_NAME environment variable"); }
    if (agentUrl) { score += 2; reasons.push("Has AGENT_URL environment variable (Self-discovery)"); }
    if (agentDesc) { score += 1; reasons.push("Has AGENT_DESCRIPTION environment variable"); }
    if (model) { score += 1; reasons.push(`Configures AI Model: ${model}`); }
    if (vertexAi) { score += 1; reasons.push("Uses Vertex AI backend"); }
    
    if (labels['agent-type']) { score += 2; reasons.push(`Has label agent-type=${labels['agent-type']}`); }
    
    // Weak signals
    if (service.name.toLowerCase().includes('agent')) { score += 0.5; reasons.push("Service name contains 'agent'"); }
    if (service.name.toLowerCase().includes('a2a')) { score += 1; reasons.push("Service name contains 'a2a'"); }

    let confidence: AgentAnalysis['confidence'] = 'None';
    if (score >= 3) confidence = 'High';
    else if (score >= 1.5) confidence = 'Medium';
    else if (score > 0) confidence = 'Low';

    return {
        isAgent: score >= 1.5, // Threshold for considering it an agent
        confidence,
        reasons,
        score,
        agentName,
        agentDescription: agentDesc,
        model
    };
};

const CloudRunAgentsPage: React.FC<CloudRunAgentsPageProps> = ({ projectNumber, setProjectNumber }) => {
    // Configuration
    const [region, setRegion] = useState('us-central1');
    const [services, setServices] = useState<CloudRunService[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Filtering
    const [filterAgentsOnly, setFilterAgentsOnly] = useState(false);
    
    // Testing State
    const [selectedService, setSelectedService] = useState<CloudRunService | null>(null);
    const [activeTab, setActiveTab] = useState<'test' | 'config'>('test');
    
    const [prompt, setPrompt] = useState('Hello, tell me about yourself.');
    const [isSending, setIsSending] = useState(false);
    const [response, setResponse] = useState<any | null>(null);
    const [testError, setTestError] = useState<string | null>(null);
    const [curlCopyStatus, setCurlCopyStatus] = useState('');

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
        projectId: projectNumber,
        appLocation: 'global',
        collectionId: '',
        appId: '',
        assistantId: '',
    }), [projectNumber]);

    // Fetch Services
    const fetchServices = async () => {
        if (!projectNumber) return;
        setIsLoading(true);
        setError(null);
        setServices([]);
        setSelectedService(null);
        try {
            const res = await api.listCloudRunServices(apiConfig, region);
            setServices(res.services || []);
            if (!res.services || res.services.length === 0) {
                setError(`No services found in ${region}.`);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to list services.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (projectNumber) fetchServices();
    }, [projectNumber, region]);

    // Filter Logic
    const displayedServices = useMemo(() => {
        if (!filterAgentsOnly) return services;
        return services.filter(s => analyzeService(s).isAgent);
    }, [services, filterAgentsOnly]);

    // Handle Sending Request
    const handleSend = async () => {
        if (!selectedService) return;
        
        setIsSending(true);
        setTestError(null);
        setResponse(null);

        try {
            // Default payload for standard ADK/Flask agents
            const payload = { prompt: prompt };
            
            // Note: This request is sent directly from the browser to the Cloud Run service.
            // If the service does not implement CORS (Access-Control-Allow-Origin), this fetch will fail.
            const res = await fetch(selectedService.uri, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text}`);
            }

            const data = await res.json();
            setResponse(data);

        } catch (err: any) {
            let msg = err.message || 'Request failed.';
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                msg = 'Network Error: This is likely a CORS (Cross-Origin Resource Sharing) issue. The browser blocked the request because the service did not return the required CORS headers.';
            }
            setTestError(msg);
        } finally {
            setIsSending(false);
        }
    };

    const handleCopyCurl = () => {
        if (!selectedService) return;
        const cmd = `curl -X POST -H "Content-Type: application/json" -d '{"prompt": "${prompt.replace(/'/g, "'\\''")}"}' "${selectedService.uri}"`;
        navigator.clipboard.writeText(cmd).then(() => {
            setCurlCopyStatus('Copied!');
            setTimeout(() => setCurlCopyStatus(''), 2000);
        });
    };

    const curlCommand = selectedService 
        ? `curl -X POST -H "Content-Type: application/json" -d '{"prompt": "${prompt.replace(/'/g, "'\\''")}"}' "${selectedService.uri}"` 
        : '';
        
    const selectedAnalysis = selectedService ? analyzeService(selectedService) : null;

    return (
        <div className="space-y-6 flex flex-col h-full">
            {/* Header / Config */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md shrink-0">
                <h2 className="text-lg font-semibold text-white mb-3">Cloud Run Agents</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Region</label>
                        <select 
                            value={region} 
                            onChange={(e) => setRegion(e.target.value)} 
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white w-full h-[42px]"
                        >
                            <option value="us-central1">us-central1</option>
                            <option value="us-east1">us-east1</option>
                            <option value="europe-west1">europe-west1</option>
                            <option value="asia-east1">asia-east1</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={fetchServices} 
                            disabled={isLoading || !projectNumber}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                        >
                            {isLoading ? 'Scanning...' : 'Scan Services'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
                
                {/* List Panel */}
                <div className="w-1/3 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                        <h3 className="text-md font-semibold text-white">Services ({displayedServices.length})</h3>
                        <label className="flex items-center cursor-pointer text-xs text-gray-400 hover:text-white">
                            <input 
                                type="checkbox" 
                                checked={filterAgentsOnly} 
                                onChange={(e) => setFilterAgentsOnly(e.target.checked)} 
                                className="mr-2 h-3.5 w-3.5 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            />
                            Show Potential Agents Only
                        </label>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {displayedServices.length === 0 && !isLoading && <p className="text-sm text-gray-500 text-center mt-4">No services found.</p>}
                        {displayedServices.map(service => {
                            const analysis = analyzeService(service);
                            return (
                                <div 
                                    key={service.name}
                                    onClick={() => { setSelectedService(service); setResponse(null); setTestError(null); setActiveTab('test'); }}
                                    className={`p-3 rounded-md cursor-pointer border transition-colors ${selectedService?.name === service.name ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-700/30 border-transparent hover:bg-gray-700'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-sm font-bold text-white truncate">{service.name.split('/').pop()}</p>
                                        {analysis.isAgent && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${analysis.confidence === 'High' ? 'bg-green-900 text-green-300 border border-green-700' : 'bg-blue-900 text-blue-300 border border-blue-700'}`}>
                                                AGENT
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">{service.uri}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Detail Panel */}
                <div className="flex-1 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
                    {selectedService ? (
                        <>
                            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="text-md font-semibold text-white">
                                    Service: <span className="text-blue-400">{selectedService.name.split('/').pop()}</span>
                                </h3>
                                <div className="flex space-x-1 bg-gray-900 p-1 rounded-lg">
                                    <button 
                                        onClick={() => setActiveTab('test')}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'test' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Test Agent
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('config')}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'config' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Service Config
                                    </button>
                                </div>
                            </div>

                            {/* Agent Analysis Card */}
                            {selectedAnalysis && selectedAnalysis.isAgent && (
                                <div className="px-6 pt-4">
                                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 border border-teal-900/50 p-4 rounded-lg shadow-inner">
                                        <div className="flex items-center mb-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-teal-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            <h4 className="text-sm font-bold text-teal-400 uppercase tracking-wider">Agent Intelligence</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            {selectedAnalysis.agentName && (
                                                <div>
                                                    <span className="text-gray-500 block text-xs">Display Name</span>
                                                    <span className="text-white font-medium">{selectedAnalysis.agentName}</span>
                                                </div>
                                            )}
                                            {selectedAnalysis.model && (
                                                <div>
                                                    <span className="text-gray-500 block text-xs">Model</span>
                                                    <span className="text-white font-medium">{selectedAnalysis.model}</span>
                                                </div>
                                            )}
                                        </div>
                                        {selectedAnalysis.agentDescription && (
                                            <div className="mt-2">
                                                <span className="text-gray-500 block text-xs">Description</span>
                                                <p className="text-gray-300 text-xs mt-0.5">{selectedAnalysis.agentDescription}</p>
                                            </div>
                                        )}
                                        <div className="mt-3 pt-3 border-t border-gray-800">
                                            <p className="text-xs text-gray-500">Identified because:</p>
                                            <ul className="text-xs text-gray-400 list-disc list-inside mt-1">
                                                {selectedAnalysis.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {activeTab === 'test' && (
                                    <>
                                        {/* Input */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-2">Prompt</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="text" 
                                                    value={prompt} 
                                                    onChange={(e) => setPrompt(e.target.value)} 
                                                    className="flex-1 bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-blue-500"
                                                    placeholder="Enter message..."
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                                />
                                                <button 
                                                    onClick={handleSend} 
                                                    disabled={isSending}
                                                    className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600"
                                                >
                                                    {isSending ? 'Sending...' : 'Send'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Response Area */}
                                        {response && (
                                            <div className="bg-gray-900 p-4 rounded-md border border-gray-700">
                                                <h4 className="text-xs font-bold text-green-400 mb-2 uppercase">Response</h4>
                                                <div className="text-sm text-gray-200 whitespace-pre-wrap font-sans">
                                                    {response.response || JSON.stringify(response, null, 2)}
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Handling */}
                                        {testError && (
                                            <div className="bg-red-900/20 p-4 rounded-md border border-red-800">
                                                <h4 className="text-sm font-bold text-red-400 mb-2">Request Failed</h4>
                                                <p className="text-xs text-red-200 mb-3">{testError}</p>
                                                
                                                {testError.includes("CORS") && (
                                                    <div className="bg-black/40 p-3 rounded text-xs">
                                                        <p className="text-gray-400 mb-2">
                                                            <strong>Workaround:</strong> The deployed service does not allow browser requests. 
                                                            You can test it from your terminal using cURL:
                                                        </p>
                                                        <CodeBlock 
                                                            title="cURL Command" 
                                                            content={curlCommand} 
                                                            onCopy={handleCopyCurl} 
                                                            copyText={curlCopyStatus || 'Copy'} 
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {activeTab === 'config' && (
                                    <div>
                                        <h4 className="text-sm font-bold text-white mb-3">Service Configuration (JSON)</h4>
                                        <div className="bg-gray-900 p-4 rounded-md border border-gray-700 overflow-auto">
                                            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                                                {JSON.stringify(selectedService, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500 flex-col">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <p>Select a service from the list to view details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CloudRunAgentsPage;
