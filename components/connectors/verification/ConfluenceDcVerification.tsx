import React from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface ConfluenceDcVerificationProps {
    dataMode: DataMode;
}

const ConfluenceDcVerification: React.FC<ConfluenceDcVerificationProps> = ({ dataMode }) => {
    
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
                     {dataMode === 'INGESTION' ? 'Confluence Data Center Ingestion Setup' : 'Confluence Data Center Federated Setup'}
                </h3>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-8">
                    
                    {/* User Administration */}
                    <div>
                        <SectionHeader number="1" title="User Administration" />
                        <p className="text-xs text-gray-400 mb-4">
                            You must create a dedicated user for the connector and grant them administrator access.
                        </p>
                        <div className="space-y-2">
                             <ChecklistItem
                                id="conf_dc_user"
                                label="Create Dedicated User"
                                subLabel="Go to Settings > User management. Create a new user (e.g., 'gemini-connector')."
                             />
                             <ChecklistItem
                                id="conf_dc_admin_group"
                                label="Add to Admin Group"
                                subLabel="Go to Groups. Add the new user to the 'confluence-administrators' group."
                                badge="Required"
                             />
                        </div>
                    </div>

                    {/* OAuth Configuration */}
                    <div>
                        <SectionHeader number="2" title="OAuth 2.0 application link" />
                        <p className="text-xs text-gray-400 mb-4">
                            Unlike Confluence Cloud which uses a global app, Confluence Data Center requires an incoming External Application link configured directly on your instance.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Link Configuration</h5>
                                <ChecklistItem
                                    id="conf_dc_app_link"
                                    label="Create Link"
                                    subLabel="Go to Settings > Applications > Application links. Click 'Create link'."
                                />
                                <ChecklistItem
                                    id="conf_dc_app_type"
                                    label="Configure Type"
                                    subLabel="Set Application type to 'External application' and Direction to 'Incoming'."
                                />
                                <ChecklistItem
                                    id="conf_dc_redirect"
                                    label="Redirect URL"
                                    subLabel="Add: https://vertexaisearch.cloud.google.com/oauth-redirect"
                                />
                            </div>
                            
                            <div>
                                <h5 className="text-xs font-semibold text-gray-300 mb-2">Required Permissions</h5>
                                <div className="bg-gray-900/50 border border-gray-700 p-3 rounded">
                                    <p className="text-sm font-medium text-white mb-1">
                                        {dataMode === 'INGESTION' ? 'Data Ingestion' : 'Federated Search'}
                                    </p>
                                    <p className="text-xs text-gray-400">Select <strong className="text-blue-400">Read</strong> permission.</p>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        Required to {dataMode === 'INGESTION' ? 'ingest' : 'search'} Confluence page content, attachments, and comments.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Authentication Method */}
                    <div>
                        <SectionHeader number="3" title="Authentication Method" />
                        <p className="text-xs text-gray-400 mb-4">
                            The credential format used in the Gemini Enterprise console depends on the operation mode.
                        </p>
                        
                        {dataMode === 'INGESTION' ? (
                             <div className="space-y-2">
                                 <ChecklistItem
                                     id="conf_dc_ingestion_auth"
                                     label="Prepare Credentials"
                                     subLabel="Data ingestion supports three methods: Username/Password, Personal Access Token (PAT), or API Token."
                                 />
                                 <p className="text-[10px] text-yellow-500 bg-yellow-900/20 p-2 rounded border border-yellow-700/50 inline-block">
                                     Note: Data Ingestion does NOT use the OAuth Client ID/Secret generated in the Application Link step.
                                 </p>
                             </div>
                        ) : (
                            <div className="space-y-2">
                                <ChecklistItem
                                    id="conf_dc_fed_auth"
                                    label="Save Client ID and Secret"
                                    subLabel="From the Application link creation step, securely copy the auto-generated Client ID (Consumer Key) and Client Secret."
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfluenceDcVerification;
