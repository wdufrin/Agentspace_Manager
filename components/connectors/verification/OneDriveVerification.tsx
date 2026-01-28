import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface OneDriveVerificationProps {
    dataMode: DataMode;
}

const OneDriveVerification: React.FC<OneDriveVerificationProps> = ({ dataMode }) => {
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const ChecklistItem = ({ id, label, subLabel, badge, badgeColor = 'bg-blue-900 text-blue-100 border-blue-700' }: { id: string, label: string, subLabel?: string, badge?: string, badgeColor?: string }) => {
        const isChecked = checkedItems[id] || false;
        return (
            <div 
                onClick={() => toggleItem(id)}
                className={`flex items-start text-xs p-2 rounded border cursor-pointer transition-colors select-none mb-2 ${
                    isChecked 
                        ? 'bg-blue-900/40 border-blue-500/50 text-blue-100' 
                        : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-600'
                }`}
            >
                <div className={`mt-0.5 min-w-[1rem] w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors ${
                    isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'
                }`}>
                    {isChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <span className="font-mono">{label}</span>
                         {badge && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] border ${badgeColor}`}>
                                {badge}
                            </span>
                        )}
                    </div>
                    {subLabel && <p className="text-gray-500 mt-0.5 leading-tight">{subLabel}</p>}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                 <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">
                    Microsoft OneDrive Setup
                </h3>

                {/* Step 1: App Registration */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        App Registration & Auth
                    </h4>
                    
                    <div className="mt-4 mb-2 text-xs font-bold text-gray-400 uppercase">Redirect URIs (Web Platform)</div>
                    <ChecklistItem 
                        id="onedrive_redirect_1" 
                        label="Callback URL 1" 
                        badge="Required"
                        subLabel="https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html"
                    />
                    <ChecklistItem 
                        id="onedrive_redirect_2" 
                        label="Callback URL 2" 
                        badge="Required"
                        subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                    />

                    <div className="mt-4 mb-2 text-xs font-bold text-gray-400 uppercase">Secrets & Credentials</div>
                    <ChecklistItem 
                        id="onedrive_client_secret" 
                        label="Client Secret" 
                        subLabel="Generate and save the Client Secret value."
                    />
                     {dataMode === 'INGESTION' && (
                        <ChecklistItem 
                            id="onedrive_fed_cred" 
                            label="Federated Credential (Optional)" 
                            badge="Ingestion"
                            subLabel="Issuer: https://accounts.google.com, Subject: (From Google Cloud Console)"
                        />
                    )}
                </div>

                {/* Step 2: API Permissions */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        API Permissions (Microsoft Graph)
                    </h4>

                    {/* Microsoft Graph */}
                    <div className="mb-6">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase border-b border-gray-700 pb-1">
                            {dataMode === 'INGESTION' ? 'Data Ingestion (Application)' : 'Federated Search (Delegated)'}
                        </h5>
                        
                        {dataMode === 'INGESTION' ? (
                            <>
                                <ChecklistItem id="grp_read_all" label="GroupMember.Read.All" badge="Application" />
                                <ChecklistItem id="user_read" label="User.Read" badge="Delegated" subLabel="Or Application if using Fed Creds/Refresh Token" />
                                <ChecklistItem id="user_read_all" label="User.Read.All" badge="Application" />
                                
                                <div className="my-2 text-[10px] text-gray-500 font-bold uppercase">Site Access (Choose One)</div>
                                <ChecklistItem id="sites_full" label="Sites.FullControl.All" badge="Application" />
                                <ChecklistItem id="sites_selected" label="Sites.Selected" badge="Application" subLabel="Requires managing specific site permissions." />
                            </>
                        ) : (
                            <>
                                <ChecklistItem id="files_read_all" label="Files.Read.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                                <ChecklistItem id="sites_read_all" label="Sites.Read.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                            </>
                        )}

                         {/* Action Scopes if requested */}
                         <div className="mt-4 pt-4 border-t border-gray-700">
                            <h6 className="text-[10px] text-gray-500 font-bold uppercase mb-2">If "Actions" functionality enabled:</h6>
                             <ChecklistItem id="act_files_rw_app" label="Files.ReadWrite.AppFolder" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="act_files_rw" label="Files.ReadWrite" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                         </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                             <ChecklistItem 
                                id="admin_consent" 
                                label="Grant Admin Consent" 
                                badge="Critical" 
                                subLabel="Required for all Application permissions."
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OneDriveVerification;
