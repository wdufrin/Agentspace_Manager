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

interface GenericVerificationProps {
    dataMode: DataMode;
}

const GenericVerification: React.FC<GenericVerificationProps> = ({ dataMode }) => {
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
                    Generic 3rd-Party Verification
                </h3>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        Authentication & Access
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Ensure the connector has the minimal necessary credentials and network paths to access the source system.
                    </p>
                    <ChecklistItem id="gen_creds" label="Valid Credentials" subLabel="Service account, OAuth App, or API token is actively provisioned and unexpired." />
                    <ChecklistItem id="gen_network" label="Network Reachability" subLabel="Source system firewall or IP allowlist permits inbound connections from Google Cloud." />
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        Permissions & Data Scopes
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Ensure the credentials have appropriate READ access to the desired objects.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">{dataMode === 'INGESTION' ? 'Data Ingestion' : 'Federated Search'}</h5>
                            <ChecklistItem id="gen_read_all" label="Read Data Access" badge="Required" subLabel="Credentials can read required objects, tickets, sites, or channels." />
                            <ChecklistItem id="gen_identity" label="Identity Mapping" badge="Required" subLabel="Source system exposes user emails to allow ACL security trimming to function." />
                            {dataMode === 'INGESTION' && (
                                <ChecklistItem id="gen_audit" label="Audit / Incremental Access" badge="Optional" subLabel="Credentials can read audit logs or webhooks for incremental syncs." />
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700 text-center">
                    <p className="text-xs text-gray-500">
                        For system-specific requirements, please refer to the <a href="https://cloud.google.com/generative-ai-app-builder/docs/connectors" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">Connector Documentation</a>.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GenericVerification;
