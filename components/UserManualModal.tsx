import React, { useState } from 'react';

interface UserManualModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const UserManualModal: React.FC<UserManualModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('overview');

    if (!isOpen) return null;

    const sections = [
        { id: 'overview', title: 'Overview' },
        { id: 'agents', title: 'Agents' },
        { id: 'builder', title: 'Agent Builder' },
        { id: 'engines', title: 'Engines & Assistants' },
        { id: 'dataStores', title: 'Data Stores' },
        { id: 'architecture', title: 'Architecture' },
        { id: 'security', title: 'Security' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Welcome to Agentspace Manager</h3>
                            <p>This centralized console allows you to manage the entire lifecycle of your Gemini Enterprise agents, from creation and configuration to deployment and monitoring.</p>
                        </section>
                        <section>
                            <h4 className="text-md font-semibold text-blue-300 mb-2">Key Concepts</h4>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>Agents:</strong> The core AI entities that interact with users. Can be built on Vertex AI or Dialogflow.</li>
                                <li><strong>Engines:</strong> The backend reasoning runtimes that power your agents (Discovery Engine).</li>
                                <li><strong>Data Stores:</strong> The knowledge bases (websites, documents) that ground your agents' responses.</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'agents':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Agent Management</h3>
                            <p>View, filter, and interact with all deployed agents. This view consolidates agents from Vertex AI Agent Engine and Dialogflow CX.</p>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase">Underlying APIs</h4>
                            <ul className="text-xs font-mono text-green-400 space-y-1">
                                <li>GET /v1beta1/projects/*/locations/*/reasoningEngines</li>
                                <li>GET /v3/projects/*/locations/*/agents (Dialogflow)</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'builder':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Agent Builder</h3>
                            <p>A drag-and-drop interface to create new agents. You can configure models (Gemini Pro/Flash), set system instructions, and attach tools (Data Stores, Open API tools).</p>
                        </section>
                        <section>
                            <h4 className="text-md font-semibold text-blue-300 mb-1">Features</h4>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li>Multi-step reasoning engine creation.</li>
                                <li>Automatic Cloud Build triggering for deployment.</li>
                                <li>"AI Rewrite" helper to optimize system instructions.</li>
                            </ul>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase">Underlying APIs</h4>
                            <ul className="text-xs font-mono text-green-400 space-y-1">
                                <li>POST /v1/projects/*/locations/*/reasoningEngines</li>
                                <li>POST /v1/projects/*/locations/*/builds (Cloud Build)</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'engines':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Engines & Assistants</h3>
                            <p>Manage the high-level application containers (Engines) and their configurations (Assistants). This is where you configure "Web Grounding," "Style Instructions," and enable/disable specific tools.</p>
                        </section>
                        <section>
                            <h4 className="text-md font-semibold text-blue-300 mb-1">Capabilities</h4>
                            <ul className="list-disc pl-5 space-y-1 text-gray-300">
                                <li><strong>Feature Flags:</strong> Toggle features like "End User Agent Creation" or location context.</li>
                                <li><strong>Model Configs:</strong> Enable/Disable specific models available to the engine.</li>
                                <li><strong>Analytics:</strong> View BigQuery export metrics for agent performance.</li>
                            </ul>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase">Underlying APIs</h4>
                            <ul className="text-xs font-mono text-green-400 space-y-1">
                                <li>GET/PATCH /v1alpha/projects/*/locations/*/collections/*/engines/*</li>
                                <li>GET/PATCH /v1alpha/.../assistants/*</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'dataStores':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Data Stores</h3>
                            <p>Manage the knowledge bases that your agents use to answer questions. You can link websites, upload documents (PDF, HTML), or connect to BigQuery tables.</p>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase">Underlying APIs</h4>
                            <ul className="text-xs font-mono text-green-400 space-y-1">
                                <li>GET /v1beta/projects/*/locations/*/collections/*/dataStores</li>
                                <li>POST /v1beta/.../branches/0/documents:import</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'architecture':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Architecture View</h3>
                            <p>A visual graph representation of your cloud resources. It automatically scans your project to show relationships between Agents, Engines, Data Stores, and underlying Compute (Cloud Run).</p>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase">Underlying APIs</h4>
                            <p className="text-xs text-gray-500 mb-1">This view aggregates data from all other APIs, plus:</p>
                            <ul className="text-xs font-mono text-green-400 space-y-1">
                                <li>GET /v2/projects/*/locations/*/services (Cloud Run)</li>
                            </ul>
                        </section>
                    </div>
                );
            case 'security':
                return (
                    <div className="space-y-4">
                        <section>
                            <h3 className="text-lg font-bold text-white mb-2">Security & Access</h3>
                            <p>Manage IAM policies and access controls. Ensure that only authorized users and service accounts can invoke your agents or modify configurations.</p>
                        </section>
                        <section className="bg-gray-900/50 p-3 rounded-md border border-gray-700">
                            <h4 className="text-xs font-mono font-bold text-gray-400 mb-2 uppercase">Underlying APIs</h4>
                            <ul className="text-xs font-mono text-green-400 space-y-1">
                                <li>POST /v1/projects/*:testIamPermissions</li>
                                <li>GET /v1/projects/*/serviceAccounts</li>
                            </ul>
                        </section>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[100] p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-700">
                <header className="p-5 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        User Manual
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <nav className="w-48 bg-gray-900/30 border-r border-gray-700 p-2 overflow-y-auto hidden md:block">
                        <ul className="space-y-1">
                            {sections.map(section => (
                                <li key={section.id}>
                                    <button
                                        onClick={() => setActiveTab(section.id)}
                                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${activeTab === section.id
                                                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                            }`}
                                    >
                                        {section.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    {/* Content Area */}
                    <main className="flex-1 p-6 overflow-y-auto custom-scrollbar text-gray-300 leading-relaxed text-sm">
                        {renderContent()}
                    </main>
                </div>

                <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
                    <button onClick={onClose} className="px-5 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-lg">
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default UserManualModal;
