import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface ServiceNowVerificationProps {
    dataMode: DataMode;
}

const ServiceNowVerification: React.FC<ServiceNowVerificationProps> = ({ dataMode }) => {
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
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">
                    {dataMode === 'INGESTION' ? 'ServiceNow Ingestion Setup' : 'ServiceNow Federated Setup'}
                </h3>

                {/* Step 1: OAuth */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        Authentication (OAuth)
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Navigate to <strong>All {'>'} System OAuth {'>'} Application registry</strong> and create a new OAuth API endpoint for external clients.
                    </p>
                    <ChecklistItem
                        id="oauth_redirect"
                        label="Set Redirect URLs"
                        subLabel="https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html, https://vertexaisearch.cloud.google.com/oauth-redirect"
                    />
                    <ChecklistItem
                        id="oauth_creds"
                        label="Save Credentials"
                        subLabel="Record the Client ID and Client Secret (unmask logic icon)."
                    />
                </div>

                {/* Step 2: Roles */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        User Roles
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-gray-900/50 rounded border border-gray-700">
                            <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Option A: Custom Role (Recommended)</h5>
                            <ChecklistItem
                                id="role_custom_create"
                                label="Create Role"
                                subLabel="Create a new custom role in User Administration."
                            />
                            <ChecklistItem
                                id="role_web_service"
                                label="Web Service Access Only"
                                subLabel="Ensure the user account has 'Web service access only' checked."
                            />
                        </div>
                        <div className="p-3 bg-gray-900/50 rounded border border-gray-700 opacity-70">
                            <h5 className="text-xs font-bold text-gray-400 mb-2 uppercase">Option B: Admin Role</h5>
                            <p className="text-xs text-gray-500 mb-2">Easier setup, but less secure.</p>
                            <ChecklistItem
                                id="role_admin"
                                label="Admin Role"
                                subLabel="Assign 'admin' role to the user."
                            />
                        </div>
                    </div>
                </div>

                {/* Step 3: ACLs */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">3</span>
                        Required Table Access (ACLs)
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Grant <strong>Read</strong> access to the custom role for these tables.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {[
                            { id: 'incident', label: 'incident', desc: 'Show incidents in search results' },
                            { id: 'kb_knowledge', label: 'kb_knowledge', desc: 'Knowledge articles' },
                            { id: 'sc_cat_item', label: 'sc_cat_item', desc: 'Catalog items' },
                            { id: 'sys_user', label: 'sys_user', desc: 'List of all users' },
                            { id: 'sys_user_group', label: 'sys_user_group', desc: 'List of user group segments' },
                            { id: 'sys_user_role', label: 'sys_user_role', desc: 'List of roles' },
                            { id: 'core_company', label: 'core_company', desc: 'Company attributes' },
                            { id: 'cmn_department', label: 'cmn_department', desc: 'Department attributes' },
                            { id: 'cmn_location', label: 'cmn_location', desc: 'Location attributes' },
                            { id: 'kb_knowledge_base', label: 'kb_knowledge_base', desc: 'Knowledge bases list' },

                            // User Criteria & Permissions
                            { id: 'user_criteria', label: 'user_criteria', desc: 'User criteria records' },
                            { id: 'sc_cat_item_user_criteria_mtom', label: 'sc_cat_item_user_criteria_mtom', desc: 'User criteria for catalog items' },
                            { id: 'sc_cat_item_user_criteria_no_mtom', label: 'sc_cat_item_user_criteria_no_mtom', desc: 'Restricted user criteria for catalog items' },
                            { id: 'sc_cat_item_user_mtom', label: 'sc_cat_item_user_mtom', desc: 'Users who can access catalog items' },
                            { id: 'sc_cat_item_user_no_mtom', label: 'sc_cat_item_user_no_mtom', desc: 'Users who cannot access catalog items' },
                            { id: 'kb_uc_can_contribute_mtom', label: 'kb_uc_can_contribute_mtom', desc: 'Can contribute to KB (user criteria)' },
                            { id: 'kb_uc_can_read_mtom', label: 'kb_uc_can_read_mtom', desc: 'Can read KB (user criteria)' },
                            { id: 'kb_uc_cannot_read_mtom', label: 'kb_uc_cannot_read_mtom', desc: 'Cannot read KB (user criteria)' },

                            // Group & Role Memberships
                            { id: 'sys_user_has_role', label: 'sys_user_has_role', desc: 'Roles assigned to users' },
                            { id: 'sys_user_grmember', label: 'sys_user_grmember', desc: 'Group members' },

                            // Portal Linking
                            { id: 'sp_portal', label: 'sp_portal', desc: 'Portal URIs' },
                            { id: 'm2m_sp_portal_knowledge_base', label: 'm2m_sp_portal_knowledge_base', desc: 'Portal URIs for KBs' },
                            { id: 'm2m_sp_portal_catalog', label: 'm2m_sp_portal_catalog', desc: 'Portal URIs for Catalog' },
                        ].map(table => (
                            <ChecklistItem
                                key={table.id}
                                id={`table_${table.id}`}
                                label={table.label}
                                subLabel={table.desc}
                            />
                        ))}
                    </div>

                    <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded">
                        <h5 className="text-xs font-bold text-yellow-500 mb-1 flex items-center">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Incident Visibility Warning
                        </h5>
                        <p className="text-[10px] text-yellow-200/80">
                            ServiceNow connector uses restrictive access control via implicit queries.
                            Users in Gemini Enterprise can only search incidents if they are the <strong>caller, assignee, or in the watch list</strong>, regardless of broader ServiceNow roles (unless they are <strong>admin</strong>, <strong>incident_manager</strong>, or <strong>change_manager</strong>).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ServiceNowVerification;
