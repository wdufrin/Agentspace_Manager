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

    const ChecklistItem = ({ id, label, subLabel, badge, copyValue, disabled }: { id: string, label: string, subLabel?: string, badge?: string, copyValue?: string, disabled?: boolean }) => {
        const isChecked = checkedItems[id] || false;

        const handleCopy = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (copyValue) {
                navigator.clipboard.writeText(copyValue);
            }
        };

        const handleClick = () => {
            if (!disabled) {
                toggleItem(id);
            }
        };

        return (
            <div
                onClick={handleClick}
                className={`flex items-start text-xs p-2 rounded border transition-colors select-none mb-2 group/item ${disabled
                    ? 'opacity-50 cursor-not-allowed bg-gray-900/30 border-gray-800 text-gray-500'
                    : 'cursor-pointer ' + (isChecked
                        ? 'bg-blue-900/40 border-blue-500/50 text-blue-100'
                        : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-600')
                    }`}
            >
                <div className={`mt-0.5 min-w-[1rem] w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors ${disabled
                    ? 'border-gray-700 bg-gray-800'
                    : (isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent')
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

                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Required Redirect URIs (Platform: Web)</h5>
                        <p className="text-gray-400 text-xs mb-2">Add these exact URIs in the Authentication section of your App Registration.</p>
                        <ChecklistItem
                            id="uri_console"
                            label="Data Source Redirect"
                            subLabel="https://vertexaisearch.cloud.google.com/console/oauth/sharepoint_oauth.html"
                            copyValue="https://vertexaisearch.cloud.google.com/console/oauth/sharepoint_oauth.html"
                        />
                        <ChecklistItem
                            id="uri_oauth"
                            label="OAuth Redirect"
                            subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                            copyValue="https://vertexaisearch.cloud.google.com/oauth-redirect"
                        />
                    </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                     <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        Permissions
                    </h4>

                    {dataMode === 'INGESTION' ? (
                        <div className="space-y-6">
                            <div>
                                <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    Microsoft Graph API
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <ChecklistItem id="graph_group_read" label="GroupMember.Read.All" badge="Application" subLabel="Read memberships and basic group properties." />
                                    <ChecklistItem id="graph_user_read" label="User.Read.All" badge="Application" subLabel="Read all user profiles." />
                                    <ChecklistItem id="graph_user_read_del" label="User.Read" badge="Delegated" subLabel="Read signed-in user profile." />
                                    <ChecklistItem id="graph_sites_full" label="Sites.FullControl.All" badge="Application" subLabel="Full control of all site collections (or use Sites.Selected)." />
                                </div>
                            </div>

                            <div>
                                <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase flex items-center gap-2">
                                    <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                    Office 365 SharePoint Online API
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <ChecklistItem id="sp_sites_full" label="Sites.FullControl.All" badge="Application" subLabel="Full control of all site collections (or use Sites.Selected)." />
                                    <ChecklistItem id="sp_term_read" label="TermStore.Read.All" badge="Application" subLabel="Read term store data." />
                                    <ChecklistItem id="sp_user_read" label="User.Read.All" badge="Application" subLabel="Read user profiles." />

                                    <div className="md:col-span-2 mt-2 pt-2 border-t border-gray-700/50">
                                        <h6 className="text-[10px] font-bold text-gray-400 mb-1 uppercase">For OAuth 2.0 Refresh Token Mode Only (Select One)</h6>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <ChecklistItem
                                                id="sp_allsites_full_del"
                                                label="AllSites.FullControl"
                                                badge="Delegated"
                                                subLabel="Required if using Refresh Token."
                                                disabled={checkedItems['sp_sites_selected_del']}
                                            />
                                            <ChecklistItem
                                                id="sp_sites_selected_del"
                                                label="Sites.Selected"
                                                badge="Delegated"
                                                subLabel="Alternative to FullControl (requires site configuration)."
                                                disabled={checkedItems['sp_allsites_full_del']}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mb-4">
                                <p className="text-xs text-blue-200">
                                    ℹ️ Federated Search uses <strong>Delegated</strong> permissions to search on behalf of the user. No Graph API permissions are required for basic search.
                                </p>
                            </div>
                            <div>
                                <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase flex items-center gap-2">
                                    <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                    Office 365 SharePoint Online API
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <ChecklistItem id="sp_search_all" label="Sites.Search.All" badge="Delegated" subLabel="Run search queries on behalf of the user." />

                                    <div className="md:col-span-2 mt-2">
                                        <h6 className="text-[10px] font-bold text-gray-400 mb-1 uppercase">Site Access (Select One)</h6>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <ChecklistItem
                                                id="sp_allsites_read"
                                                label="AllSites.Read"
                                                badge="Delegated"
                                                subLabel="Read documents/lists in all site collections."
                                                disabled={checkedItems['sp_sites_fed_selected']}
                                            />
                                            <ChecklistItem
                                                id="sp_sites_fed_selected"
                                                label="Sites.Selected"
                                                badge="Delegated"
                                                subLabel="Read specific site collections (requires config)."
                                                disabled={checkedItems['sp_allsites_read']}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SharePointVerification;
