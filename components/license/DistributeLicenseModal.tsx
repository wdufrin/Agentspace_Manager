
import React, { useState } from 'react';
import * as api from '../../services/apiService';
import { Config } from '../../types';
import Spinner from '../Spinner';

interface DistributeLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  billingAccountId: string;
  billingAccountLicenseConfigId: string;
  currentProjectNumber: string;
  onSuccess: () => void;
}

const DistributeLicenseModal: React.FC<DistributeLicenseModalProps> = ({ 
    isOpen, 
    onClose, 
    billingAccountId, 
    billingAccountLicenseConfigId,
    currentProjectNumber,
    onSuccess 
}) => {
    const [targetProject, setTargetProject] = useState(currentProjectNumber);
    const [location, setLocation] = useState('global');
    const [count, setCount] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const config: Config = {
                projectId: currentProjectNumber, // Used for auth context
                appLocation: location,
                collectionId: '', appId: '', assistantId: ''
            } as any;

            await api.distributeLicense(billingAccountId, billingAccountLicenseConfigId, {
                projectNumber: targetProject,
                location: location,
                licenseCount: count,
                // licenseConfigId: optional, if we knew it we could pass it, but API allows omitted for creation
            }, config);

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to distribute licenses");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-white">Distribute Licenses</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Target Project Number</label>
                        <input 
                            type="text" 
                            required
                            value={targetProject}
                            onChange={(e) => setTargetProject(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. 123456789012"
                        />
                        <p className="text-xs text-gray-500 mt-1">The project that will receive the licenses.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                        <select 
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="global">global</option>
                            <option value="us">us</option>
                            <option value="eu">eu</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Quantity to Add</label>
                        <input 
                            type="number" 
                            required
                            min="1"
                            value={count}
                            onChange={(e) => setCount(parseInt(e.target.value))}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                        >
                            {isLoading ? <Spinner className="w-4 h-4 mr-2" /> : null}
                            Distribute
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DistributeLicenseModal;
