import React from 'react';

const ZendeskVerification: React.FC = () => {
    
    const ChecklistItem = ({ label, subLabel, id, badge }: { label: string, subLabel: string, id: string, badge?: string }) => (
        <label htmlFor={id} className="flex items-start space-x-3 p-3 rounded bg-gray-900 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer group mb-2">
            <div className="flex-shrink-0 mt-0.5">
                <input
                    type="checkbox"
                    id={id}
                    className="w-4 h-4 text-blue-500 bg-gray-800 border-gray-600 rounded focus:ring-blue-600 focus:ring-2 cursor-pointer"
                />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                     <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{label}</p>
                     {badge && (
                          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-blue-900/50 text-blue-300 border border-blue-700/50">
                              {badge}
                          </span>
                     )}
                </div>
                <p className="text-xs text-gray-400 mt-1">{subLabel}</p>
            </div>
        </label>
    );

    const SectionHeader = ({ number, title }: { number: string, title: string }) => (
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center">
            <span className="bg-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px] mr-2 flex-shrink-0">{number}</span>
            {title}
        </h4>
    );

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">
                     Zendesk Federated Setup
                </h3>
                
                <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mb-6">
                    <p className="text-xs text-blue-200">
                        <strong>Note:</strong> Currently, the Gemini Enterprise Zendesk connector primarily supports <strong>Federated Search</strong>.
                    </p>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-8">
                    
                    {/* Token Access */}
                    <div>
                        <SectionHeader number="1" title="Enable Token Access" />
                        <p className="text-xs text-gray-400 mb-4">
                            You must explicitly allow Zendesk API token access before configuring OAuth.
                        </p>
                        <div className="space-y-2">
                             <ChecklistItem
                                id="zendesk_token_access"
                                label="Allow API Token Access"
                                subLabel="In Zendesk Admin Center, go to Apps and integrations > APIs > API configuration. Select 'Allow API token access' and save."
                             />
                        </div>
                    </div>

                    {/* OAuth Client */}
                    <div>
                        <SectionHeader number="2" title="Create OAuth Client" />
                        <p className="text-xs text-gray-400 mb-4">
                            Generate the core credentials needed for the OAuth connection.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">OAuth Client Details</h5>
                                <ChecklistItem
                                    id="zendesk_client_create"
                                    label="Create Client"
                                    subLabel="In Admin Center > Apps and integrations > APIs > OAuth clients, click 'Add OAuth client'."
                                />
                                <ChecklistItem
                                    id="zendesk_client_redirect"
                                    label="Add Redirect URL"
                                    subLabel="Enter: https://vertexaisearch.cloud.google.com/oauth-redirect"
                                    badge="Required"
                                />
                            </div>
                            
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Save Credentials</h5>
                                <div className="bg-gray-900/50 border border-gray-700 p-3 rounded">
                                    <p className="text-[10px] text-gray-400 mb-2">After clicking Save, securely copy the following fields. You will need them in the next step:</p>
                                    <ul className="text-xs text-gray-300 list-disc list-inside space-y-1">
                                        <li><strong className="text-white">Client ID</strong> (Unique Identifier)</li>
                                        <li><strong className="text-white">Client secret</strong></li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* OAuth Connection Setup */}
                    <div>
                        <SectionHeader number="3" title="Create OAuth Connection" />
                        <p className="text-xs text-gray-400 mb-4">
                            Link your credentials to establish the final connection with proper scopes.
                        </p>
                        <div className="space-y-2">
                            <ChecklistItem
                                id="zendesk_conn_create"
                                label="Create Client Connection"
                                subLabel="In Admin Center > Apps and integrations > Connections > OAuth Clients, click 'Add client'."
                            />
                            <ChecklistItem
                                id="zendesk_conn_creds"
                                label="Enter Standard Details"
                                subLabel="Set grant type to 'Authorization code'. Enter the Client ID and Client Secret from Step 2."
                            />
                            <div className="bg-gray-900/50 border border-gray-700 p-3 rounded ml-7 mt-2 mb-2">
                                <p className="text-xs font-semibold text-white mb-2">Configure URLs & Scopes</p>
                                <p className="text-[10px] text-gray-400 mb-1">Replace <span className="font-mono text-gray-300">&lt;your-subdomain&gt;</span> with your Zendesk subdomain:</p>
                                <ul className="text-[10px] text-gray-300 space-y-2">
                                    <li><strong>Authorize URL:</strong> <span className="font-mono">https://&lt;your-subdomain&gt;.zendesk.com/oauth/authorize</span></li>
                                    <li><strong>Token URL:</strong> <span className="font-mono">https://&lt;your-subdomain&gt;.zendesk.com/oauth/token</span></li>
                                </ul>
                                <p className="text-[10px] text-gray-400 mt-3 mb-1">Enter the following space-separated scopes:</p>
                                <div className="bg-gray-800 p-2 rounded text-xs text-blue-400 font-mono border border-gray-700 inline-block">
                                    read users:read
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ZendeskVerification;
