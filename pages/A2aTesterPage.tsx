import React, { useState, useEffect } from 'react';
import { CloudRunService, Config } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';

interface A2aTesterPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

const A2aTesterPage: React.FC<A2aTesterPageProps> = ({ projectNumber, setProjectNumber }) => {
    // State for configuration
    const [cloudRunRegion, setCloudRunRegion] = useState('us-central1');
    const [services, setServices] = useState<CloudRunService[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [serviceUrl, setServiceUrl] = useState('');
    const [identityToken, setIdentityToken] = useState('');
    
    // State for fetching agent card
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agentCard, setAgentCard] = useState<any | null>(null);

    // Fetch Cloud Run services when project or region changes
    useEffect(() => {
        if (!projectNumber || !cloudRunRegion) {
            setServices([]);
            setServiceUrl('');
            return;
        }
        const fetchServices = async () => {
            setIsLoadingServices(true);
            setServices([]);
            setServiceUrl('');
            setError(null);
            setAgentCard(null);
            try {
                const res = await api.listCloudRunServices({ projectId: projectNumber } as Config, cloudRunRegion);
                const fetchedServices = res.services || [];
                setServices(fetchedServices);
                if (fetchedServices.length === 0) {
                    setError(`No Cloud Run services found in ${cloudRunRegion}.`);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to fetch Cloud Run services.');
            } finally {
                setIsLoadingServices(false);
            }
        };
        fetchServices();
    }, [projectNumber, cloudRunRegion]);

    const handleFetchCard = async () => {
        if (!serviceUrl || !identityToken) {
            setError("Please select a service and provide an identity token.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setAgentCard(null);

        try {
            const result = await api.fetchA2aAgentCard(serviceUrl, identityToken);
            setAgentCard(result);
        } catch (err: any) {
            setError(`Error fetching agent card: ${err.message || "An unknown error occurred."}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const tokenCommand = serviceUrl && projectNumber
        ? `gcloud auth print-identity-token --audience ${serviceUrl} --project ${projectNumber}`
        : `# Select a project and service to generate the command`;

    return (
        <div className="flex flex-col h-full space-y-6">
            <h1 className="text-2xl font-bold text-white">A2A Agent Tester</h1>
            <p className="text-gray-400 -mt-4">
                Test your deployed A2A Cloud Run functions by fetching their <code className="bg-gray-700 text-xs p-1 rounded">/.well-known/agent.json</code> discovery file.
            </p>

            {/* Configuration */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md space-y-4">
                <h2 className="text-lg font-semibold text-white">Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                     <div>
                        <label htmlFor="cloudRunRegion" className="block text-sm font-medium text-gray-400 mb-1">Cloud Run Region</label>
                        <select id="cloudRunRegion" value={cloudRunRegion} onChange={(e) => setCloudRunRegion(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                            <option value="us-central1">us-central1</option><option value="us-east1">us-east1</option><option value="us-east4">us-east4</option><option value="us-west1">us-west1</option><option value="europe-west1">europe-west1</option><option value="europe-west2">europe-west2</option><option value="europe-west4">europe-west4</option><option value="asia-east1">asia-east1</option><option value="asia-southeast1">asia-southeast1</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="serviceUrl" className="block text-sm font-medium text-gray-400 mb-1">Agent to Test</label>
                        <select id="serviceUrl" value={serviceUrl} onChange={(e) => setServiceUrl(e.target.value)} disabled={isLoadingServices} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
                            <option value="">{isLoadingServices ? 'Loading...' : '-- Select a Service --'}</option>
                            {services.map(s => <option key={s.name} value={s.uri}>{s.name.split('/').pop()}</option>)}
                        </select>
                    </div>
                </div>
                 <div>
                    <label htmlFor="identityToken" className="block text-sm font-medium text-gray-400 mb-1">Identity Token</label>
                    <p className="text-xs text-gray-400 mb-2">Run the command below in your terminal and paste the output here. This token is required to securely call your Cloud Run service.</p>
                    <pre className="bg-gray-900 text-xs text-gray-300 p-2 rounded-md font-mono mb-2">{tokenCommand}</pre>
                    <input
                        id="identityToken"
                        type="password"
                        value={identityToken}
                        onChange={(e) => setIdentityToken(e.target.value)}
                        placeholder="Paste Identity Token here"
                        className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
                    />
                </div>
            </div>

            {/* Action and Results */}
            <div className="space-y-4">
                <button
                    onClick={handleFetchCard}
                    disabled={isLoading || !serviceUrl || !identityToken}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {isLoading ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                            Fetching...
                        </>
                    ) : 'Fetch Agent Card'}
                </button>

                <div className="bg-gray-800 shadow-md rounded-lg border border-gray-700 min-h-[200px] flex flex-col">
                    <div className="p-2 bg-gray-900/50 border-b border-gray-700">
                        <h3 className="text-md font-semibold text-gray-300">Agent Card Response</h3>
                    </div>
                    <div className="flex-1 p-4">
                        {isLoading && <Spinner />}
                        {error && <p className="text-red-400 text-sm">{error}</p>}
                        {agentCard && (
                            <pre className="text-xs text-gray-200 whitespace-pre-wrap">
                                <code>{JSON.stringify(agentCard, null, 2)}</code>
                            </pre>
                        )}
                        {!isLoading && !error && !agentCard && (
                            <p className="text-gray-500 text-sm text-center pt-10">Results will be displayed here.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default A2aTesterPage;