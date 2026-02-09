import React, { useState } from 'react';
import * as api from '../../services/apiService';
import { Config } from '../../types';

interface WorkforcePoolValidatorProps {
    config: Config;
}

const WorkforcePoolValidator: React.FC<WorkforcePoolValidatorProps> = ({ config }) => {
    const [poolName, setPoolName] = useState('');
    const [validationResult, setValidationResult] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);

    const handleValidate = async () => {
        if (!poolName) {
            setError('Please enter a Workforce Pool resource name.');
            return;
        }

        setIsValidating(true);
        setError(null);
        setValidationResult(null);

        try {
            // Ensure format is correct or strip prefix if needed?
            // User likely pastes "locations/global/workforcePools/my-pool"
            let nameToValidate = poolName.trim();
            if (nameToValidate.startsWith('//iam.googleapis.com/')) {
                nameToValidate = nameToValidate.replace('//iam.googleapis.com/', '');
            }
            
            const result = await api.validateWorkforcePool(nameToValidate, config);
            setValidationResult(result);
        } catch (err: any) {
            setError(err.message || 'Validation failed. Pool might not exist or you lack permissions.');
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 max-w-2xl mx-auto mt-8">
            <h3 className="text-xl font-bold text-white mb-4">Workforce Pool Validator</h3>
            <p className="text-gray-400 mb-4 text-sm">
                Check if a Workforce Identity Pool exists and is accessible.
            </p>

            <div className="space-y-4">
                <div>
                    <label htmlFor="poolName" className="block text-sm font-medium text-gray-300">
                        Workforce Pool Name
                    </label>
                    <div className="flex mt-1">
                        <input
                            type="text"
                            id="poolName"
                            value={poolName}
                            onChange={(e) => setPoolName(e.target.value)}
                            placeholder="locations/global/workforcePools/my-pool-id"
                            className="flex-1 block w-full bg-gray-700 border-gray-600 rounded-l-md shadow-sm text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                            onClick={handleValidate}
                            disabled={isValidating || !poolName}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed"
                        >
                            {isValidating ? 'Checking...' : 'Validate'}
                        </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                        Format: <code>locations/&#123;location&#125;/workforcePools/&#123;pool_id&#125;</code>
                    </p>
                </div>

                {error && (
                    <div className="p-3 bg-red-900/50 border border-red-700 rounded-md text-red-200 text-sm">
                        <p className="font-semibold">Validation Error:</p>
                        <p>{error}</p>
                    </div>
                )}

                {validationResult && (
                    <div className="p-3 bg-green-900/50 border border-green-700 rounded-md text-green-200 text-sm">
                        <p className="font-semibold flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Pool Found!
                        </p>
                        <div className="mt-2 text-xs font-mono bg-black/30 p-2 rounded overflow-x-auto">
                            <pre>{JSON.stringify(validationResult, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorkforcePoolValidator;
