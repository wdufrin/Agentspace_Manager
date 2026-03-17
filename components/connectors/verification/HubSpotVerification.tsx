import React, { useState } from 'react';

const HubSpotVerification: React.FC = () => {
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const ChecklistItem = ({ id, label, subLabel }: { id: string, label: string, subLabel?: string }) => {
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
                    HubSpot Connector Setup
                </h3>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        Google-Managed App Integration
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        The HubSpot data store uses a Google-managed OAuth app. No manual client credentials or scopes are needed.
                    </p>
                    <ChecklistItem id="hubspot_managed" label="Verify Data Store Setup" subLabel="Data Store must be created with the Google-managed App type." />
                    <ChecklistItem id="hubspot_roles" label="IAM Permissions Verified" subLabel="Service Agent interacting with HubSpot must have Discovery Engine Editor role." />
                </div>
            </div>
        </div>
    );
};

export default HubSpotVerification;
