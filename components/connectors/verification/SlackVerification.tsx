import React from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface SlackVerificationProps {
    dataMode: DataMode;
}

const SlackVerification: React.FC<SlackVerificationProps> = ({ dataMode }) => {
    
    const ChecklistItem = ({ label, subLabel, id }: { label: string, subLabel: string, id: string }) => (
        <label htmlFor={id} className="flex items-start space-x-3 p-3 rounded bg-gray-900 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer group">
            <div className="flex-shrink-0 mt-0.5">
                <input
                    type="checkbox"
                    id={id}
                    className="w-4 h-4 text-blue-500 bg-gray-800 border-gray-600 rounded focus:ring-blue-600 focus:ring-2 cursor-pointer"
                />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">{label}</p>
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
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider flex items-center">
                    Slack Setup
                    {dataMode === 'INGESTION' && (
                         <span className="ml-3 text-[10px] bg-red-900/50 text-red-200 border border-red-700/50 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
                             Not Supported
                         </span>
                    )}
                </h3>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-8">

                    {dataMode === 'INGESTION' ? (
                        <div className="text-center py-6">
                            <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-gray-300 mb-2">Slack Data Ingestion is not currently supported.</p>
                            <p className="text-xs text-gray-500">The Slack connector only supports Federated Search mode.</p>
                        </div>
                    ) : (
                        <>
                             {/* Prerequisites */}
                             <div>
                                <SectionHeader number="1" title="Prerequisites" />
                                <div className="space-y-2 mb-4">
                                     <ChecklistItem
                                        id="slack_admin"
                                        label="Slack Administrator Access"
                                        subLabel="Ensure you have access to the Slack workspace you want to connect to authorize the application."
                                     />
                                     <ChecklistItem
                                        id="slack_plan"
                                        label="Slack AI Search Plan"
                                        subLabel="Verify that your Slack workspace plan includes Slack AI Search capabilities."
                                     />
                                </div>
                            </div>
                            
                            {/* Google Cloud Console Setup */}
                            <div>
                                <SectionHeader number="2" title="Google Cloud Console Setup" />
                                <p className="text-xs text-gray-400 mb-4">
                                    The Slack connector uses a straightforward OAuth flow directly from the Gemini Enterprise console.
                                </p>
                                <div className="space-y-2">
                                    <ChecklistItem
                                        id="console_create"
                                        label="Create Data Store"
                                        subLabel="Navigate to Gemini Enterprise > Data Stores. Click 'Create Data Store' and select 'Slack Federated'."
                                    />
                                    <ChecklistItem
                                        id="console_auth"
                                        label="Authenticate Workspace"
                                        subLabel="In the Authentication settings, click 'Login'. Select your workspace from the top-right corner of the Slack dialog and click 'Allow'."
                                    />
                                    <ChecklistItem
                                        id="console_entities"
                                        label="Select Entities"
                                        subLabel="Choose the entities you want to search (e.g., Message, File). Note: File content search results may vary."
                                    />
                                </div>
                            </div>
                            
                            {/* User Authorization */}
                            <div>
                                <SectionHeader number="3" title="User Authorization" />
                                <p className="text-xs text-gray-400 mb-4">
                                    After the connector is set up, end users must authorize Gemini Enterprise to search their Slack data.
                                </p>
                                <div className="space-y-2">
                                     <ChecklistItem
                                        id="user_auth"
                                        label="Authorize Source"
                                        subLabel="Users will see Slack listed in their search source panel. They must click 'Authorize', sign in, and click 'Grant access'."
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SlackVerification;
