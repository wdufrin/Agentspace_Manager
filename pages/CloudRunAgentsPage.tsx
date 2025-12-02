
import React, { useState, useEffect, useMemo } from 'react';
import { CloudRunService, Config } from '../types';
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

const CloudRunAgentsPage: React.FC<CloudRunAgentsPageProps> = ({ projectNumber, setProjectNumber }) => {
    // Configuration
    const [region, setRegion] = useState('us-central1');
    const [services, setServices] = useState<CloudRunService[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Testing State
    const [selectedService, setSelectedService] = useState<CloudRunService | null>(null);
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
                    <button 
                        onClick={fetchServices} 
                        disabled={isLoading || !projectNumber}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                    >
                        {isLoading ? 'Scanning...' : 'Scan Services'}
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 gap-6 min-h-0 overflow-hidden">
                
                {/* List Panel */}
                <div className="w-1/3 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-gray-700">
                        <h3 className="text-md font-semibold text-white">Services ({services.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {services.length === 0 && !isLoading && <p className="text-sm text-gray-500 text-center mt-4">No services found.</p>}
                        {services.map(service => (
                            <div 
                                key={service.name}
                                onClick={() => { setSelectedService(service); setResponse(null); setTestError(null); }}
                                className={`p-3 rounded-md cursor-pointer border ${selectedService?.name === service.name ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-700/30 border-transparent hover:bg-gray-700'}`}
                            >
                                <p className="text-sm font-bold text-white truncate">{service.name.split('/').pop()}</p>
                                <p className="text-xs text-gray-400 mt-1 truncate">{service.uri}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Test Panel */}
                <div className="flex-1 bg-gray-800 rounded-lg shadow-md flex flex-col overflow-hidden">
                    {selectedService ? (
                        <>
                            <div className="p-4 border-b border-gray-700">
                                <h3 className="text-md font-semibold text-white">Test Agent: <span className="text-blue-400">{selectedService.name.split('/').pop()}</span></h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                
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
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            Select a service from the list to test.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CloudRunAgentsPage;
