import React from 'react';

const NotionVerification: React.FC = () => {
    
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
                     Notion Federated Setup
                </h3>
                
                <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mb-6">
                    <p className="text-xs text-blue-200">
                        <strong>Note:</strong> Currently, the Gemini Enterprise Notion connector primarily supports <strong>Federated Search</strong>.
                    </p>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-8">
                    
                    {/* Integration Creation */}
                    <div>
                        <SectionHeader number="1" title="Create a Notion Integration" />
                        <p className="text-xs text-gray-400 mb-4">
                            You must create a new integration in the Notion Integrations dashboard.
                        </p>
                        <div className="space-y-2">
                             <ChecklistItem
                                id="notion_integration_create"
                                label="Create Integration"
                                subLabel="Navigate to the Notion Integrations dashboard (https://www.notion.so/profile/integrations) and click 'New integration'."
                             />
                             <ChecklistItem
                                id="notion_integration_type"
                                label="Configure Type and Workspace"
                                subLabel="Select your associated workplace. In the Type list, select 'Public'."
                                badge="Required"
                             />
                             <ChecklistItem
                                id="notion_integration_org"
                                label="Organizational Details"
                                subLabel="Fill in required organizational fields such as Company name, Website, and Privacy policy."
                             />
                        </div>
                    </div>

                    {/* OAuth Configuration */}
                    <div>
                        <SectionHeader number="2" title="OAuth Configuration" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Redirect URIs</h5>
                                <p className="text-[10px] text-gray-400 mb-3">Add the following exactly as shown in the OAuth domain & URIs section:</p>
                                <ChecklistItem
                                    id="notion_redirect_1"
                                    label="Add First Redirect"
                                    subLabel="https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html"
                                />
                                <ChecklistItem
                                    id="notion_redirect_2"
                                    label="Add Second Redirect"
                                    subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                                />
                            </div>
                            
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Required Capabilities</h5>
                                <p className="text-[10px] text-gray-400 mb-3">In the Capabilities section under Content Requests, you must select the following:</p>
                                <div className="space-y-2">
                                    <ChecklistItem
                                        id="notion_capability_read_content"
                                        label="Read Content"
                                        subLabel="Select the 'Read content' capability and click 'Save changes'."
                                        badge="Required"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Authentication Setup */}
                    <div>
                        <SectionHeader number="3" title="Authentication Method" />
                        <div className="space-y-2">
                            <ChecklistItem
                                id="notion_auth_credentials"
                                label="Save OAuth Credentials"
                                subLabel="From the integration's settings page under Configuration, securely copy the OAuth Client ID and OAuth Client Secret."
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotionVerification;
