import React from 'react';

const DropboxVerification: React.FC = () => {
    
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
                     Dropbox Federated Setup
                </h3>
                
                <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mb-6">
                    <p className="text-xs text-blue-200">
                        <strong>Note:</strong> Currently, the Gemini Enterprise Dropbox connector primarily supports <strong>Federated Search</strong>.
                    </p>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-8">
                    
                    {/* App Creation */}
                    <div>
                        <SectionHeader number="1" title="Create a Dropbox App" />
                        <p className="text-xs text-gray-400 mb-4">
                            You must create a new Scoped Access app in the Dropbox App Console.
                        </p>
                        <div className="space-y-2">
                             <ChecklistItem
                                id="dropbox_app_create"
                                label="Create App"
                                subLabel="Navigate to the Dropbox App Console and click 'Create app'."
                             />
                             <ChecklistItem
                                id="dropbox_app_type"
                                label="Configure API Type"
                                subLabel="Select 'Scoped access' and 'Full Dropbox' for the type of access you need."
                             />
                             <ChecklistItem
                                id="dropbox_app_enable_users"
                                label="Enable Additional Users"
                                subLabel="In the Settings tab for your new app, click 'Enable additional users' to raise the limit."
                             />
                        </div>
                    </div>

                    {/* OAuth Configuration */}
                    <div>
                        <SectionHeader number="2" title="OAuth 2.0 Configuration" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Redirect URIs</h5>
                                <p className="text-[10px] text-gray-400 mb-3">Add the following exactly as shown in the OAuth 2 Redirect URIs field:</p>
                                <ChecklistItem
                                    id="dropbox_redirect_1"
                                    label="Add First Redirect"
                                    subLabel="https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html"
                                />
                                <ChecklistItem
                                    id="dropbox_redirect_2"
                                    label="Add Second Redirect"
                                    subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                                />
                            </div>
                            
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Required Permissions</h5>
                                <p className="text-[10px] text-gray-400 mb-3">In the Permissions tab, you must select exactly these three Individual Read Scopes:</p>
                                <div className="space-y-2">
                                    <ChecklistItem
                                        id="dropbox_scope_account"
                                        label="Account Info"
                                        subLabel="account_info.read"
                                    />
                                    <ChecklistItem
                                        id="dropbox_scope_metadata"
                                        label="Files and Folders"
                                        subLabel="files.metadata.read"
                                    />
                                    <ChecklistItem
                                        id="dropbox_scope_content"
                                        label="Files content"
                                        subLabel="files.content.read"
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
                                id="dropbox_auth_credentials"
                                label="Save App Key and Secret"
                                subLabel="From the app's Settings tab, securely copy the auto-generated App Key (Client ID) and App Secret (Client Secret)."
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DropboxVerification;
