import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface TeamsVerificationProps {
    dataMode: DataMode;
}

const TeamsVerification: React.FC<TeamsVerificationProps> = ({ dataMode }) => {
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
                    Microsoft Teams Setup
                </h3>

                {/* Step 1: App Registration */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        App Registration & Auth
                    </h4>
                    
                     <div className="mt-4 mb-2 text-xs font-bold text-gray-400 uppercase">Redirect URIs (Web Platform)</div>
                    <ChecklistItem 
                        id="teams_redirect" 
                        label="Callback URL" 
                        badge="Required"
                        subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                    />

                    <div className="mt-4 mb-2 text-xs font-bold text-gray-400 uppercase">Secrets & Credentials</div>
                    <ChecklistItem 
                        id="teams_client_secret" 
                        label="Client Secret" 
                        subLabel="Generate and save the Client Secret value."
                    />
                </div>

                {/* Step 2: API Permissions */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        API Permissions (Microsoft Graph)
                    </h4>

                    {/* Microsoft Graph */}
                    <div className="mb-6">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase border-b border-gray-700 pb-1">Federated Search (Delegated)</h5>
                        <p className="text-[10px] text-gray-500 mb-4">Teams verification is primarily supported for Federated Search (Public Preview).</p>
                        
                        <div className="grid grid-cols-1 gap-2">
                             <ChecklistItem id="chat_read" label="Chat.Read" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="chat_basic" label="Chat.ReadBasic" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="chat_msg_read" label="ChatMessage.Read" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             
                             <div className="border-t border-gray-700 my-2"></div>
                             
                             <ChecklistItem id="channel_basic" label="Channel.ReadBasic.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="channel_msg_read" label="ChannelMessage.Read.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="team_basic" label="Team.ReadBasic.All" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             
                             <div className="border-t border-gray-700 my-2"></div>

                             <ChecklistItem id="user_read" label="User.Read" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                        </div>

                         
                         {/* Action Scopes if requested */}
                         <div className="mt-4 pt-4 border-t border-gray-700">
                            <h6 className="text-[10px] text-gray-500 font-bold uppercase mb-2">If "Actions" functionality enabled:</h6>
                             <ChecklistItem id="act_chan_send" label="ChannelMessage.Send" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                             <ChecklistItem id="act_chat_send" label="ChatMessage.Send" badge="Delegated" badgeColor="bg-purple-900 text-purple-100 border-purple-700" />
                         </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                             <ChecklistItem 
                                id="admin_consent" 
                                label="Grant Admin Consent" 
                                badge="Critical" 
                                subLabel="Required for all permissions to function correctly."
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TeamsVerification;
