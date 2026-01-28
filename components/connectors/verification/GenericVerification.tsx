import React from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface GenericVerificationProps {
    dataMode: DataMode;
}

const GenericVerification: React.FC<GenericVerificationProps> = ({ dataMode }) => {
    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">Generic Verification</h3>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
                    <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-gray-400 mb-2">
                        No specific {dataMode === 'INGESTION' ? 'ingestion' : 'federated'} verification guide available for this connector type.
                    </p>
                    <p className="text-xs text-gray-500">
                        Please refer to the generic <a href="https://cloud.google.com/generative-ai-app-builder/docs/connectors" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">Connector Documentation</a>.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GenericVerification;
