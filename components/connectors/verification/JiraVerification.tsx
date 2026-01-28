import React, { useState } from 'react';
import { DataMode } from '../ConnectorVerificationTab';

interface JiraVerificationProps {
    dataMode: DataMode;
}

const JiraVerification: React.FC<JiraVerificationProps> = ({ dataMode }) => {
    const [checkedScopes, setCheckedScopes] = useState<Record<string, boolean>>({});
    const [includeActions, setIncludeActions] = useState(false);

    const toggleScope = (scope: string) => {
        setCheckedScopes(prev => ({
            ...prev,
            [scope]: !prev[scope]
        }));
    };

    const getClassicReadScopes = () => {
        return ['read:jira-user', 'read:jira-work'];
    };

    const getClassicActionScopes = () => {
        return ['write:jira-work'];
    };

    const getGranularReadScopes = () => {
        return dataMode === 'INGESTION'
            ? [
                'read:user:jira',
                'read:group:jira',
                'read:avatar:jira',
                'read:issue-security-level:jira',
                'read:issue-security-scheme:jira',
                'read:audit-log:jira',
                'read:board-scope.admin:jira-software',
                'read:board-scope:jira-software',
                'read:issue-details:jira',
                'read:jql:jira',
                'read:project:jira'
            ]
            : [];
    };

    const getGranularActionScopes = () => {
        return ['write:comment:jira', 'write:issue:jira'];
    };

    const ScopeItem = ({ scope }: { scope: string }) => {
        const isChecked = checkedScopes[scope] || false;
        return (
            <div
                onClick={() => toggleScope(scope)}
                className={`flex items-center text-xs p-2 rounded border cursor-pointer transition-colors select-none ${isChecked
                    ? 'bg-blue-900/40 border-blue-500/50 text-blue-100'
                    : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-600'
                    }`}
            >
                <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'
                    }`}>
                    {isChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <code>{scope}</code>
            </div>
        );
    };

    const SectionHeader = ({ number, title, badge }: { number: string, title: string, badge?: string }) => (
        <h4 className="text-sm font-semibold text-white mb-2 flex items-center">
            <span className="bg-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px] mr-2">{number}</span>
            {title}
            {badge && <span className="ml-2 text-[10px] bg-purple-900 text-purple-100 border border-purple-700 px-1.5 py-0.5 rounded-full">{badge}</span>}
        </h4>
    );

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mt-1">
                        Atlassian Jira Setup
                    </h3>
                    <label className="flex items-center space-x-2 bg-gray-800 px-3 py-1.5 rounded border border-gray-700 cursor-pointer hover:border-gray-600">
                        <input
                            type="checkbox"
                            checked={includeActions}
                            onChange={(e) => setIncludeActions(e.target.checked)}
                            className="form-checkbox h-4 w-4 text-blue-600 rounded bg-gray-900 border-gray-600 focus:ring-0 focus:ring-offset-0"
                        />
                        <span className="text-xs text-gray-200 font-medium">Include Actions</span>
                    </label>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-8">
                    {/* Classic Scopes */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <SectionHeader number="1" title="Classic Scopes" />
                            <button
                                onClick={() => setCheckedScopes({})}
                                className="text-[10px] text-gray-500 hover:text-gray-300 underline"
                            >
                                Reset
                            </button>
                        </div>

                        <p className="text-gray-400 text-xs mb-3">
                            Go to <strong>Classic scopes</strong> tab in Developer Console.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <h5 className="text-[10px] text-gray-500 font-bold uppercase mb-1">Read Access</h5>
                                <div className="grid grid-cols-2 gap-2">
                                    {(getClassicReadScopes()).map(scope => (
                                        <ScopeItem key={scope} scope={scope} />
                                    ))}
                                    {/* Always include offline_access for good measure/standard OAuth? Docs didn't mention it explicitly but usually required for refresh tokens. Keeping simple to docs for now. */}
                                </div>
                            </div>

                            {includeActions && (
                                <div>
                                    <h5 className="text-[10px] text-purple-400 font-bold uppercase mb-1">Write Access (Actions)</h5>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(getClassicActionScopes()).map(scope => (
                                            <ScopeItem key={scope} scope={scope} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Granular Scopes */}
                    <div>
                        <SectionHeader number="2" title="Granular Scopes" badge={dataMode === 'INGESTION' ? 'Critical for Ingestion' : undefined} />
                        <p className="text-gray-400 text-xs mb-3">
                            Go to <strong>Granular scopes</strong> tab.
                        </p>

                        <div className="space-y-3">
                            {getGranularReadScopes().length > 0 ? (
                                <div>
                                    <h5 className="text-[10px] text-gray-500 font-bold uppercase mb-1">Read Access</h5>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {getGranularReadScopes().map(scope => (
                                            <ScopeItem key={scope} scope={scope} />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                !includeActions && (
                                    <p className="text-gray-500 text-xs italic p-1 border border-dashed border-gray-700 rounded text-center">
                                        No specific granular scopes required for basic Federated Search.
                                    </p>
                                )
                            )}

                            {includeActions && (
                                <div>
                                    <h5 className="text-[10px] text-purple-400 font-bold uppercase mb-1">Write Access (Actions)</h5>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {getGranularActionScopes().map(scope => (
                                            <ScopeItem key={scope} scope={scope} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>


                    {/* Verify Section */}
                    <div>
                        <h4 className="text-lg font-semibold text-white mb-4 flex items-center pt-4 border-t border-gray-700">
                            <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">3</span>
                            Verify Connectivity
                        </h4>
                        <div className="bg-black/50 p-4 rounded-lg border border-gray-700 font-mono text-xs text-green-400 overflow-x-auto relative group">
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs text-gray-500">Copy to Terminal</span>
                            </div>
                            {dataMode === 'INGESTION'
                                ? 'curl -v -u YOUR_EMAIL:YOUR_API_TOKEN \\\n  -H "Content-Type: application/json" \\\n  "https://YOUR_DOMAIN.atlassian.net/rest/api/3/myself"'
                                : 'curl -v -u YOUR_EMAIL:YOUR_API_TOKEN \\\n  -H "Content-Type: application/json" \\\n  "https://YOUR_DOMAIN.atlassian.net/rest/api/3/issue/picker?query=test"'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JiraVerification;
