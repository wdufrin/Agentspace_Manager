import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface SharePointVerificationProps {
    dataMode: DataMode;
}

const SharePointVerification: React.FC<SharePointVerificationProps> = ({ dataMode }) => {
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const ChecklistItem = ({ id, label, subLabel, badge, copyValue }: { id: string, label: string, subLabel?: string, badge?: string, copyValue?: string }) => {
        const isChecked = checkedItems[id] || false;

        const handleCopy = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (copyValue) {
                navigator.clipboard.writeText(copyValue);
            }
        };

        return (
            <div
                onClick={() => toggleItem(id)}
                className={`flex items-start text-xs p-2 rounded border cursor-pointer transition-colors select-none mb-2 group/item ${isChecked
                    ? 'bg-blue-900/40 border-blue-500/50 text-blue-100'
                        : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-600'
                    }`}
            >
                <div className={`mt-0.5 min-w-[1rem] w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'
                    }`}>
                    {isChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="font-mono">{label}</span>
                        <div className="flex items-center gap-2">
                            {copyValue && (
                                <button
                                    onClick={handleCopy}
                                    className="opacity-0 group-hover/item:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-white"
                                    title="Copy to clipboard"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            )}
                            {badge && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-700 text-gray-300 border border-gray-600 whitespace-nowrap">
                                    {badge}
                                </span>
                            )}
                        </div>
                    </div>
                    {subLabel && <p className="text-gray-500 mt-0.5 leading-tight break-all">{subLabel}</p>}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">
                    SharePoint Setup
                </h3>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        Prerequisites
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Ensure you have an Entra ID (Azure AD) registered application.
                    </p>
                    <ChecklistItem id="sp_tenant" label="Tenant ID" subLabel="Your Microsoft 365 Tenant ID." />
                    <ChecklistItem id="sp_client_id" label="Client ID" subLabel="Application (Client) ID from App Registration." />
                    <ChecklistItem id="sp_secret" label="Client Secret" subLabel="A valid client secret from Certificates & secrets." />
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                     <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        Permissions (Microsoft Graph)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Required (Application)</h5>
                            <ChecklistItem id="perm_sites_read" label="Sites.Read.All" badge="Application" />
                            <ChecklistItem id="perm_files_read" label="Files.Read.All" badge="Application" />
                            <ChecklistItem id="perm_user_read" label="User.Read.All" badge="Application" />
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SharePointVerification;
