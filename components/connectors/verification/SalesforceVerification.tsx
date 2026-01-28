import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface SalesforceVerificationProps {
    dataMode: DataMode;
}

type AuthType = 'USER_PASS' | 'OAUTH_JWT' | 'OAUTH_CLIENT_CREDS';

const SalesforceVerification: React.FC<SalesforceVerificationProps> = ({ dataMode }) => {
    const [authType, setAuthType] = useState<AuthType>('OAUTH_CLIENT_CREDS');
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const ChecklistItem = ({ id, label, subLabel, badge }: { id: string, label: string, subLabel?: string, badge?: string }) => {
        const isChecked = checkedItems[id] || false;
        return (
            <div
                onClick={() => toggleItem(id)}
                className={`flex items-start text-xs p-2 rounded border cursor-pointer transition-colors select-none mb-2 ${isChecked
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
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <span className="font-mono">{label}</span>
                        {badge && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-700 text-gray-300 border border-gray-600">
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
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                        {dataMode === 'INGESTION' ? 'Salesforce V2 Ingestion' : 'Salesforce Federated'}
                    </h3>
                    <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                        <button
                            onClick={() => setAuthType('OAUTH_CLIENT_CREDS')}
                            className={`px-2 py-1 text-[10px] rounded transition-colors ${authType === 'OAUTH_CLIENT_CREDS' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            OAuth Client Creds
                        </button>
                        <button
                            onClick={() => setAuthType('OAUTH_JWT')}
                            className={`px-2 py-1 text-[10px] rounded transition-colors ${authType === 'OAUTH_JWT' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            OAuth JWT
                        </button>
                        <button
                            onClick={() => setAuthType('USER_PASS')}
                            className={`px-2 py-1 text-[10px] rounded transition-colors ${authType === 'USER_PASS' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            User/Pass
                        </button>
                    </div>
                </div>

                {dataMode === 'INGESTION' && (
                    <div className="mb-4 p-2 bg-blue-900/20 border border-blue-800/50 rounded flex items-center">
                        <svg className="w-4 h-4 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-[10px] text-blue-200">Salesforce V2 Connector (Recommended) - Supports SOAP API 30.0+</span>
                    </div>
                )}

                {/* Auth Config */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        Authentication Setup
                    </h4>

                    {authType === 'OAUTH_CLIENT_CREDS' && (
                        <div className="space-y-1">
                            <p className="text-xs text-gray-400 mb-3">Setup "External Client App" in Salesforce.</p>
                            <ChecklistItem id="app_enable_client_creds" label="Enable Client Credentials Flow" subLabel="In Flow Enablement settings." />
                            <ChecklistItem id="app_callback" label="Callback URL" subLabel="https://vertexaisearch.cloud.google.com/console/oauth/salesforce_oauth.html" />
                            <ChecklistItem id="app_scopes" label="Scopes" subLabel="Full (full), API (api), Refresh Token (refresh_token, offline_access)" />
                            <ChecklistItem id="app_policies" label="Pre-Authorize Users" subLabel="Set 'Permitted Users' to 'Admin approved users are pre-authorized' in Policies." />
                            <ChecklistItem id="app_run_as" label="Run As User" subLabel="Assign the specific user in 'Run as user' field." />
                        </div>
                    )}

                    {authType === 'OAUTH_JWT' && (
                        <div className="space-y-1">
                            <p className="text-xs text-gray-400 mb-3">Setup "External Client App" with JWT Bearer.</p>
                            <ChecklistItem id="jwt_keys" label="Generate Keys" subLabel="openssl genrsa -out server.key 2048" />
                            <ChecklistItem id="jwt_cert" label="Generate Cert" subLabel="openssl req -new -x509 ... -out server.crt" />
                            <ChecklistItem id="app_upload_cert" label="Upload Cert" subLabel="Upload server.crt to Salesforce App settings." />
                            <ChecklistItem id="app_policies_jwt" label="Pre-Authorize" subLabel="Admin approved users are pre-authorized." />
                        </div>
                    )}

                    {authType === 'USER_PASS' && (
                        <div className="space-y-1">
                            <p className="text-xs text-gray-400 mb-3">Basic Authentication (Legacy/Simple).</p>
                            <ChecklistItem id="up_token" label="Reset Security Token" subLabel="Settings > Reset my security token. Check email." />
                            <ChecklistItem id="up_password" label="Password + Token" subLabel="You may need to append the token to the password for some clients." />
                        </div>
                    )}
                </div>

                {/* Permissions */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        User Permissions (Permission Set)
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Create a Permission Set and assign it to the integration user.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">System Permissions</h5>
                            <ChecklistItem id="perm_api" label="API Enabled" />
                            <ChecklistItem id="perm_users" label="View All Users" />
                            <ChecklistItem id="perm_roles" label="View Roles and Role Hierarchy" />
                            <ChecklistItem id="perm_setup" label="View Setup and Configuration" />
                        </div>
                        <div>
                            <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Object Settings</h5>
                            <ChecklistItem id="perm_view_all" label="View All Records" badge="Critical" subLabel="For each entity to be ingested." />
                            <ChecklistItem id="perm_fields" label="Field Access" subLabel="Read access to all synced fields." />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesforceVerification;
