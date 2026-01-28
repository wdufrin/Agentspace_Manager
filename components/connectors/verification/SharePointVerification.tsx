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
                    Microsoft SharePoint Setup
                </h3>

                {/* Step 1: App Registration */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        App Registration & Auth
                    </h4>
                    
                    <ChecklistItem 
                        id="sp_register" 
                        label="Create Application" 
                        subLabel="Supported account types: 'Accounts in this organizational directory only'."
                    />
                    
                    <div className="mt-4 mb-2 text-xs font-bold text-gray-400 uppercase">Redirect URIs (Web Platform)</div>
                    <ChecklistItem 
                        id="sp_redirect_1" 
                        label="Callback URL 1" 
                        badge="Required"
                        subLabel="https://vertexaisearch.cloud.google.com/console/oauth/sharepoint_oauth.html"
                    />
                    <ChecklistItem 
                        id="sp_redirect_2" 
                        label="Callback URL 2" 
                        badge="Required"
                        subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                    />

                    <div className="mt-4 mb-2 text-xs font-bold text-gray-400 uppercase">Secrets & Credentials</div>
                    <ChecklistItem 
                        id="sp_client_secret" 
                        label="Client Secret" 
                        subLabel="Generate and save the Client Secret value."
                    />
                    {dataMode === 'INGESTION' && (
                        <ChecklistItem 
                            id="sp_fed_cred" 
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
                        API Permissions
                    </h4>

                    {/* Microsoft Graph */}
                    <div className="mb-6">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase border-b border-gray-700 pb-1">Microsoft Graph API</h5>
                        
                        {dataMode === 'INGESTION' ? (
                            <>
                                <ChecklistItem id="graph_group_read" label="GroupMember.Read.All" badge="Application" />
                                <ChecklistItem id="graph_user_read" label="User.Read" badge="Delegated" />
                                <ChecklistItem id="graph_user_read_all" label="User.Read.All" badge="Application" />
                                
                                <div className="my-2 text-[10px] text-gray-500 font-bold uppercase">Site Control (Choose One)</div>
                                <ChecklistItem id="graph_sites_full" label="Sites.FullControl.All" badge="Application" />
                                <ChecklistItem id="graph_sites_selected" label="Sites.Selected" badge="Application" subLabel="Requires additional configuration (see below)." />
                            </>
                        ) : (
                             <div className="text-xs text-gray-500 italic p-2">
                                No Graph API permissions explicitly required for basic Federated Search (unless Actions enabled).
                             </div>
                        )}
                         
                         {/* Common Action Scopes if requested */}
                         <div className="mt-4">
                            <h6 className="text-[10px] text-gray-500 font-bold uppercase mb-1">If "Actions" functionality enabled:</h6>
                             <ChecklistItem id="act_sites_rw" label="Sites.ReadWrite.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="act_files_rw" label="Files.ReadWrite.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                         </div>
                    </div>

                    {/* Microsoft SharePoint */}
                    <div>
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase border-b border-gray-700 pb-1">Microsoft SharePoint API</h5>
                        
                        {dataMode === 'FEDERATED' ? (
                            <>
                                 <ChecklistItem id="sp_search_all" label="Sites.Search.All" badge="Delegated" />
                                 <div className="my-2 text-[10px] text-gray-500 font-bold uppercase">Site Access (Choose One)</div>
                                 <ChecklistItem id="sp_allsites_read" label="AllSites.Read" badge="Delegated" />
                                 <ChecklistItem id="sp_sites_selected" label="Sites.Selected" badge="Delegated" />
                            </>
                        ) : (
                            <>
                                <div className="my-2 text-[10px] text-gray-500 font-bold uppercase">Site Access (Choose One)</div>
                                <ChecklistItem id="sp_ingest_full" label="Sites.FullControl.All" badge="Application" />
                                <ChecklistItem id="sp_ingest_selected" label="Sites.Selected" badge="Application" subLabel="Recommended for granular access control." />
                            </>
                        )}
                    </div>
                </div>

                {/* Step 3: Sites.Selected Special Config */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">3</span>
                        "Sites.Selected" Configuration
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        If you chose <strong>Sites.Selected</strong>, you must grant permissions to specific sites via API.
                    </p>

                    <div className="bg-black/30 p-3 rounded border border-gray-700 font-mono text-[10px] text-gray-300 overflow-x-auto">
                        <div className="mb-2">
                            <span className="text-green-400">GET</span> https://graph.microsoft.com/v1.0/sites/HOSTNAME:SITE_PATH
                        </div>
                        <div className="text-gray-500 mb-4">// Result gives you SITE_ID</div>
                        
                        <div className="mb-2">
                             <span className="text-blue-400">POST</span> https://graph.microsoft.com/v1.0/sites/SITE_ID/permissions
                        </div>
                        <pre className="text-gray-400">
{`{
  "roles": ["fullControl"],
  "grantedToIdentities": [{
    "application": {
      "id": "CLIENT_ID",
      "displayName": "DISPLAY_NAME"
    }
  }]
}`}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SharePointVerification;
