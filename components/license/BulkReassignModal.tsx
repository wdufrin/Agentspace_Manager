import React, { useState } from 'react';
import * as api from '../../services/apiService';
import { Config } from '../../types';
import Spinner from '../Spinner';

interface BulkReassignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    selectedLicenses: { userPrincipal: string; licenseConfig: string }[];
    availableLicenseConfigs: any[];
    projectNumber: string;
    apiConfig: { appLocation: string; userStoreId: string };
}

const BulkReassignModal: React.FC<BulkReassignModalProps> = ({ isOpen, onClose, onSuccess, selectedLicenses, availableLicenseConfigs, projectNumber, apiConfig }) => {
    const [selectedConfig, setSelectedConfig] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!selectedConfig) {
            setError("Please select a target license configuration.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const config: Config = {
                projectId: projectNumber,
                appLocation: apiConfig.appLocation,
                collectionId: '', appId: '', assistantId: ''
            } as any;

            // Ensure the config name is a project-level resource name
            const rawId = selectedConfig.split('/').pop() || selectedConfig;
            let projectLevelConfigName = selectedConfig;
            
            if (!projectLevelConfigName.includes(`projects/`)) {
                // Reformulate as a project-level config
                projectLevelConfigName = `projects/${projectNumber}/locations/${apiConfig.appLocation}/licenseConfigs/${rawId}`;
            }

            // To move a user safely, perform a targeted revoke of their OLD license BEFORE assigning the NEW one.
            // This prevents a user from holding two licenses simultaneously, which was the previous buggy behavior.
            
            // 1. Target existing licenses for revocation (if they don't match the new target config)
            const licensesToRevoke = selectedLicenses.filter(l => 
                l.licenseConfig && l.licenseConfig !== projectLevelConfigName
            ).map(l => ({
                userPrincipal: l.userPrincipal,
                licenseConfig: l.licenseConfig
            }));

            // 2. Perform safe revocation by updating the entire user store
            if (licensesToRevoke.length > 0) {
                await api.revokeSpecificLicenses(config, apiConfig.userStoreId, licensesToRevoke);
            }

            // 3. Assign the new license config to all selected users
            const userPrincipals = selectedLicenses.map(l => l.userPrincipal);
            await api.assignUserLicenses(config, apiConfig.userStoreId, userPrincipals, projectLevelConfigName);
            
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to reassign licenses.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900/50">
                    <h3 className="text-lg font-medium text-white">Bulk Reassign Licenses</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white" disabled={isSubmitting}>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-300 mb-4 text-sm">
                        You have selected <strong>{selectedLicenses.length}</strong> user(s) to reassign. Choose the new license configuration below.
                    </p>
                    
                    {error && (
                        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Target License Configuration</label>
                        <select
                            value={selectedConfig}
                            onChange={(e) => setSelectedConfig(e.target.value)}
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white w-full"
                            disabled={isSubmitting}
                        >
                            <option value="">-- Select License --</option>
                            {availableLicenseConfigs.map((cfg, idx) => {
                                const cfgName = cfg.name || '';
                                const rawId = cfgName.split('/').pop() || 'Unknown Config';
                                // If it's a billing account config, we want to show the raw ID (which is the subscription ID)
                                // If it's a project config and has a displayName, show that + the ID for clarity
                                const displayName = cfg.displayName ? `${cfg.displayName} (${rawId})` : rawId;
                                
                                return (
                                    <option key={idx} value={cfgName}>
                                        {displayName}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-transparent text-gray-300 hover:text-white border border-gray-600 rounded hover:bg-gray-700 disabled:opacity-50"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 disabled:bg-gray-600 flex items-center"
                        disabled={isSubmitting || !selectedConfig}
                    >
                        {isSubmitting ? (
                            <>
                                <Spinner className="w-4 h-4 mr-2" />
                                Processing...
                            </>
                        ) : (
                            'Confirm Reassignment'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkReassignModal;
