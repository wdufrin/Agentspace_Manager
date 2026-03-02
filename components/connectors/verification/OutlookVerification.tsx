/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface OutlookVerificationProps {
    dataMode: DataMode;
}

const OutlookVerification: React.FC<OutlookVerificationProps> = ({ dataMode }) => {
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const ChecklistItem = ({ id, label, subLabel, badge, copyValue }: { id: string, label: string, subLabel?: string, badge?: string, copyValue?: string }) => {
        const isChecked = checkedItems[id] || false;

        const handleCopy = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (copyValue) {
                navigator.clipboard.writeText(copyValue);
            }
        };

        return (
            <div
                onClick={() => toggleItem(id)}
                className={`flex items-start text-xs p-2 rounded border cursor-pointer transition-colors select-none mb-2 group/item ${isChecked
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
                    {dataMode === 'INGESTION' ? 'Outlook Ingestion Setup' : 'Outlook Federated Setup'}
                </h3>

                 <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        App Registration & OAuth 2.0
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Register an application in Microsoft Entra admin center. Ensure <strong>Accounts in this organizational directory only</strong> is selected.
                    </p>
                    <ChecklistItem id="ol_tenant" label="Tenant ID" subLabel="Your Microsoft 365 Tenant ID." />
                    <ChecklistItem id="ol_client_id" label="Client ID" subLabel="Application (Client) ID from App Registration." />
                    <ChecklistItem id="ol_secret" label="Client Secret" subLabel="A valid client secret from Certificates & secrets." />

                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Required Redirect URIs (Platform: Web)</h5>
                        <p className="text-gray-400 text-xs mb-2">Add these exact URIs in the Authentication section of your App Registration.</p>
                        <ChecklistItem
                            id="ol_uri_console"
                            label="Data Source Redirect"
                            subLabel="https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html"
                            copyValue="https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html"
                        />
                        <ChecklistItem
                            id="ol_uri_oauth"
                            label="OAuth Redirect"
                            subLabel="https://vertexaisearch.cloud.google.com/oauth-redirect"
                            copyValue="https://vertexaisearch.cloud.google.com/oauth-redirect"
                        />
                    </div>

                    {dataMode === 'INGESTION' && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                            <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Federated Credentials (Optional)</h5>
                            <p className="text-gray-400 text-xs mb-2">If using Federated credentials, add a credential with Issuer: <code>https://accounts.google.com</code>.</p>
                            <ChecklistItem id="ol_fed_cred" label="Federated Credential" subLabel="Use the Subject identifier generated during data store creation." />
                        </div>
                    )}
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                     <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        Permissions (Microsoft Graph)
                    </h4>

                    {dataMode === 'INGESTION' ? (
                        <div className="space-y-6">
                            <div>
                                <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Data Ingestion (Application Permissions)</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <ChecklistItem id="ol_ingest_cal" label="Calendars.Read" badge="Application" subLabel="Read events of all calendars." />
                                    <ChecklistItem id="ol_ingest_cal_basic" label="Calendars.ReadBasic.All" badge="Application" subLabel="Read basic events of all calendars." />
                                    <ChecklistItem id="ol_ingest_contacts" label="Contacts.Read" badge="Application" subLabel="Read all contacts in all mailboxes." />
                                    <ChecklistItem id="ol_ingest_mail" label="Mail.Read" badge="Application" subLabel="Read mail in all mailboxes." />
                                    <ChecklistItem id="ol_ingest_mail_basic" label="Mail.ReadBasic" badge="Application" subLabel="Read basic mail properties." />
                                    <ChecklistItem id="ol_ingest_mail_basic_all" label="Mail.ReadBasic.All" badge="Application" subLabel="Read basic mail properties in all mailboxes." />
                                    <ChecklistItem id="ol_ingest_user" label="User.Read.All" badge="Application" subLabel="Read full user profiles." />
                                    <ChecklistItem id="ol_ingest_user_basic" label="User.ReadBasic.All" badge="Application" subLabel="Read basic user profiles." />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                                <div>
                                <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Federated Search (Delegated Permissions)</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <ChecklistItem id="ol_fed_mail" label="Mail.Read" badge="Delegated" subLabel="Read signed-in user's mailbox." />
                                    <ChecklistItem id="ol_fed_cal" label="Calendars.Read" badge="Delegated" subLabel="Read signed-in user's calendar." />
                                    <ChecklistItem id="ol_fed_contacts" label="Contacts.Read" badge="Delegated" subLabel="Read signed-in user's contacts." />
                                    <ChecklistItem id="ol_fed_user" label="User.Read" badge="Delegated" subLabel="Read signed-in user profile." />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 pt-4 border-t border-gray-700">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Actions / Write (Optional)</h5>
                        <p className="text-[10px] text-gray-500 mb-2 leading-tight">These Delegated permissions are required for creating or updating content or sending mail.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ChecklistItem id="ol_act_mail" label="Mail.Send" badge="Delegated" subLabel="Send mail as users." />
                            <ChecklistItem id="ol_act_cal" label="Calendars.ReadWrite" badge="Delegated" subLabel="Create, read, update, delete events." />
                            <ChecklistItem id="ol_act_contacts" label="Contacts.ReadWrite" badge="Delegated" subLabel="Create, read, update, delete contacts." />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default OutlookVerification;
