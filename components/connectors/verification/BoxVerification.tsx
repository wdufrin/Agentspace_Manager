import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface BoxVerificationProps {
    dataMode: DataMode;
}

const BoxVerification: React.FC<BoxVerificationProps> = ({ dataMode }) => {
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const ChecklistItem = ({ id, label, subLabel, badge }: { id: string, label: string, subLabel?: string, badge?: string }) => {
        const isChecked = checkedItems[id] || false;
        return (
            <div
                onClick={() => toggleItem(id)}
                className={`flex items-start text-xs p-2 rounded border cursor-pointer transition-colors select-none mb-2 group/item ${isChecked ? 'bg-blue-900/40 border-blue-500/50 text-blue-100' : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-600'}`}
            >
                <div className={`mt-0.5 min-w-[1rem] w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'}`}>
                    {isChecked && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="font-mono">{label}</span>
                        {badge && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-700 text-gray-300 border border-gray-600 whitespace-nowrap">{badge}</span>}
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
                    {dataMode === 'INGESTION' ? 'Box Ingestion Setup' : 'Box Federated Setup'}
                </h3>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        Authentication Configuration
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Configure the Box App in the Box Admin Console.
                    </p>
                    <ChecklistItem id="auth_type" label="Server Auth (JWT)" subLabel="Application requires Server Auth (JWT) authentication type." />
                    <ChecklistItem id="app_access" label="App + Enterprise access" subLabel="Application access level must be set to App + Enterprise access." />
                    <ChecklistItem id="auth_admin" label="Authorize the Box App" badge="Critical" subLabel="An administrator must authorize the app in the Box Admin Console." />
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        Application Scopes
                    </h4>
                    
                    <div className="mb-4">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Core Scopes</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <ChecklistItem id="scope_read_files" label="Read all files and folders stored in Box" subLabel="Required for both Federated Search and Data Ingestion." />
                            <ChecklistItem id="scope_write_files" label="Write all files and folders stored in Box" badge="Modify/Ingest" subLabel="Required for Federated Search (actions) and Data Ingestion." />
                        </div>
                    </div>

                    {dataMode === 'INGESTION' && (
                        <div>
                            <h5 className="text-xs font-bold text-gray-400 mb-2 uppercase">Administrative Scopes</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <ChecklistItem id="scope_manage_users" label="Manage users" subLabel="Required to retrieve files, comments, and tasks from individual user accounts." />
                                <ChecklistItem id="scope_manage_enterprise" label="Manage enterprise properties" subLabel="Necessary for incremental sync functionality." />
                                <ChecklistItem id="scope_manage_groups" label="Manage groups" subLabel="Required to fetch group lists and members for access control during ingestion." />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BoxVerification;
