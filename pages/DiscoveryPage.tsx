import React, { useState } from 'react';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import DiscoveryActionsCard from '../components/discovery/DiscoveryActionsCard';
import { Config } from '../types';

interface DiscoveryPageProps {
    accessToken: string;
    projectNumber: string;
}

const DiscoveryPage: React.FC<DiscoveryPageProps> = ({ accessToken, projectNumber }) => {
    const [config, setConfig] = useState({
        appLocation: 'global',
        collectionId: '',
        dataStoreId: '',
        appId: '',
        assistantId: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<any | null>(null);
    const [resultTitle, setResultTitle] = useState('');

    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setConfig({ ...config, [e.target.name]: e.target.value });
    };

    const handleAction = async (resource: 'agents' | 'dataStores' | 'engines' | 'documents', title: string) => {
        if (!accessToken) {
            setError("Please set your GCP Access Token to begin.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setResults(null);
        setResultTitle(title);

        const apiConfig: Config = {
            ...config,
            accessToken,
            projectId: projectNumber
        };

        try {
            const response = await api.listResources(resource, apiConfig);
            setResults(response);
        } catch (err: any)
{
            setError(err.message || `Failed to fetch ${title}.`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderConfigInput = (key: string, value: string) => {
        const label = key.replace(/([A-Z])/g, ' $1');
        
        if (key === 'appLocation') {
            return (
                <div key={key}>
                    <label htmlFor={key} className="block text-sm font-medium text-gray-400 capitalize">{label}</label>
                    <select
                        name={key}
                        id={key}
                        value={value}
                        onChange={handleConfigChange}
                        className="mt-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
                    >
                        <option value="global">global</option>
                        <option value="us">us</option>
                        <option value="eu">eu</option>
                    </select>
                </div>
            );
        }
        return (
            <div key={key}>
                <label htmlFor={key} className="block text-sm font-medium text-gray-400 capitalize">{label}</label>
                <input
                    type="text"
                    name={key}
                    id={key}
                    value={value}
                    onChange={handleConfigChange}
                    placeholder={label}
                    className="mt-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
                />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Discovery Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Project ID / Number</label>
                        <div className="mt-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                           {projectNumber || <span className="text-gray-500 italic">Not set (on Agents page)</span>}
                        </div>
                    </div>
                    {/* FIX: Explicitly convert value from Object.entries to string to fix type error. */}
                    {Object.entries(config).map(([key, value]) => renderConfigInput(key, String(value)))}
                </div>
            </div>

            <DiscoveryActionsCard onAction={handleAction} isLoading={isLoading} />

            {error && <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-lg">{error}</div>}
            
            {isLoading && <Spinner />}

            {results && (
                 <div className="bg-gray-800 shadow-xl rounded-lg">
                     <div className="p-4 border-b border-gray-700">
                        <h3 className="text-xl font-bold text-white">Results: {resultTitle}</h3>
                    </div>
                    <pre className="p-4 text-xs text-gray-200 overflow-x-auto">
                        {JSON.stringify(results, null, 2)}
                    </pre>
                 </div>
            )}
        </div>
    );
};

export default DiscoveryPage;