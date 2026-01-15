import React, { useState, useEffect } from 'react';
import { Assistant, VertexAiAgentConfig, Config, EnabledAction, EnabledTool, ReasoningEngine } from '../../types';
import * as api from '../../services/apiService';
import InfoTooltip from '../InfoTooltip';

interface AssistantDetailsFormProps {
    assistant: Assistant;
    config: Config;
    onUpdateSuccess: (updatedAssistant: Assistant) => void;
}

const ALL_REASONING_ENGINE_LOCATIONS = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1',
    'europe-west1', 'europe-west2', 'europe-west4',
    'asia-east1', 'asia-southeast1'
];

const CollapsibleSection: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-t border-gray-700 pt-4">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left">
                <h3 className="text-md font-semibold text-white">{title}</h3>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
            {isOpen && <div className="mt-2">{children}</div>}
        </div>
    );
};

const AssistantDetailsForm: React.FC<AssistantDetailsFormProps> = ({ assistant, config, onUpdateSuccess }) => {
    const [formData, setFormData] = useState({
        displayName: '',
        styleAndFormattingInstructions: '',
        additionalSystemInstruction: '',
        webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED',
        customerPolicy: '{}',
        enableEndUserAgentCreation: false,
        disableLocationContext: false,
        defaultWebGroundingToggleOff: false,
        vertexAiSearchToolConfig: '{}',
    });
    const [agentConfigs, setAgentConfigs] = useState<VertexAiAgentConfig[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // State for fetching available reasoning engines
    const [availableEngines, setAvailableEngines] = useState<ReasoningEngine[]>([]);
    const [isLoadingEngines, setIsLoadingEngines] = useState(false);
    const [engineError, setEngineError] = useState<string | null>(null);

    useEffect(() => {
        setFormData({
            displayName: assistant.displayName || '',
            styleAndFormattingInstructions: assistant.styleAndFormattingInstructions || '',
            additionalSystemInstruction: assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '',
            webGroundingType: assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED',
            customerPolicy: assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy, null, 2) : '{}',
            enableEndUserAgentCreation: assistant.enableEndUserAgentCreation || false,
            disableLocationContext: assistant.disableLocationContext || false,
            defaultWebGroundingToggleOff: assistant.defaultWebGroundingToggleOff || false,
            vertexAiSearchToolConfig: assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig, null, 2) : '{}',
        });
        setAgentConfigs(assistant.vertexAiAgentConfigs ? JSON.parse(JSON.stringify(assistant.vertexAiAgentConfigs)) : []);
    }, [assistant]);
    
    // Fetch available agent engines
    useEffect(() => {
        const fetchEngines = async () => {
            if (!config.projectId) return;
            setIsLoadingEngines(true);
            setEngineError(null);
            try {
                const enginePromises = ALL_REASONING_ENGINE_LOCATIONS.map(loc =>
                    api.listReasoningEngines({ ...config, reasoningEngineLocation: loc })
                        .then(res => res.reasoningEngines || [])
                        .catch(e => {
                            console.warn(`Could not fetch engines from ${loc}: ${e instanceof Error ? e.message : String(e)}`);
                            return [];
                        })
                );
                const allEngines = (await Promise.all(enginePromises)).flat();
                setAvailableEngines(allEngines);
            } catch (err: any) {
                setEngineError('Failed to load available agent engines.');
            } finally {
                setIsLoadingEngines(false);
            }
        };
        fetchEngines();
    }, [config.projectId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleAgentConfigChange = (index: number, field: keyof VertexAiAgentConfig, value: string) => {
        const newConfigs = [...agentConfigs];
        const updatedConfig = { ...newConfigs[index], [field]: value };

        // Auto-populate display name and description if they are empty when a new engine is selected
        if (field === 'name' && value) {
            const selectedEngine = availableEngines.find(e => e.name === value);
            if (selectedEngine) {
                if (!updatedConfig.displayName) {
                    updatedConfig.displayName = selectedEngine.displayName;
                }
                if (!updatedConfig.toolDescription) {
                    updatedConfig.toolDescription = `Use this tool to interact with the ${selectedEngine.displayName} agent.`;
                }
            }
        }
        newConfigs[index] = updatedConfig;
        setAgentConfigs(newConfigs);
    };

    const handleAddAgentConfig = () => {
        setAgentConfigs([...agentConfigs, { name: '', displayName: '', toolDescription: '' }]);
    };

    const handleRemoveAgentConfig = (index: number) => {
        setAgentConfigs(agentConfigs.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const payload: any = {};
            const updateMask: string[] = [];

            if (formData.styleAndFormattingInstructions !== (assistant.styleAndFormattingInstructions || '')) {
                payload.styleAndFormattingInstructions = formData.styleAndFormattingInstructions;
                updateMask.push('styleAndFormattingInstructions');
            }
            if (formData.additionalSystemInstruction !== (assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '')) {
                payload.generationConfig = {
                    systemInstruction: {
                        additionalSystemInstruction: formData.additionalSystemInstruction
                    }
                };
                updateMask.push('generationConfig.systemInstruction');
            }
            if (formData.webGroundingType !== (assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED')) {
                payload.webGroundingType = formData.webGroundingType;
                updateMask.push('webGroundingType');
            }
            
            let policyObj;
            try {
                policyObj = JSON.parse(formData.customerPolicy);
            } catch (e) {
                setError("Customer Policy is not valid JSON.");
                setIsSubmitting(false);
                return;
            }

            const originalPolicyString = assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy) : '{}';
            const currentPolicyString = JSON.stringify(policyObj);

            if (currentPolicyString !== originalPolicyString) {
                payload.customerPolicy = policyObj;
                updateMask.push('customerPolicy');
            }

            if (formData.enableEndUserAgentCreation !== (assistant.enableEndUserAgentCreation || false)) {
                payload.enableEndUserAgentCreation = formData.enableEndUserAgentCreation;
                updateMask.push('enableEndUserAgentCreation');
            }
            if (formData.disableLocationContext !== (assistant.disableLocationContext || false)) {
                payload.disableLocationContext = formData.disableLocationContext;
                updateMask.push('disableLocationContext');
            }
            if (formData.defaultWebGroundingToggleOff !== (assistant.defaultWebGroundingToggleOff || false)) {
                payload.defaultWebGroundingToggleOff = formData.defaultWebGroundingToggleOff;
                updateMask.push('defaultWebGroundingToggleOff');
            }

            let searchToolConfigObj;
            try {
                searchToolConfigObj = JSON.parse(formData.vertexAiSearchToolConfig);
            } catch (e) {
                setError("Vertex AI Search Tool Config is not valid JSON.");
                setIsSubmitting(false);
                return;
            }
            const originalSearchToolConfigString = assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig) : '{}';
            const currentSearchToolConfigString = JSON.stringify(searchToolConfigObj);

            if (currentSearchToolConfigString !== originalSearchToolConfigString) {
                payload.vertexAiSearchToolConfig = searchToolConfigObj;
                updateMask.push('vertexAiSearchToolConfig');
            }


            const originalConfigsString = JSON.stringify(assistant.vertexAiAgentConfigs || []);
            const currentConfigsString = JSON.stringify(agentConfigs);

            if (originalConfigsString !== currentConfigsString) {
                for (const cfg of agentConfigs) {
                    if (!cfg.name || !cfg.displayName || !cfg.toolDescription) {
                        throw new Error("All fields for each Vertex AI Agent Config (Agent Engine, Display Name, Tool Description) are required.");
                    }
                }
                payload.vertexAiAgentConfigs = agentConfigs;
                updateMask.push('vertexAiAgentConfigs');
            }

            if (updateMask.length === 0) {
                setSuccess("No changes detected.");
                setTimeout(() => setSuccess(null), 3000);
                setIsSubmitting(false);
                return;
            }

            const updatedAssistant = await api.updateAssistant(assistant.name, payload, updateMask, config);
            onUpdateSuccess(updatedAssistant);
            setSuccess("Assistant updated successfully!");
            setTimeout(() => setSuccess(null), 3000);

        } catch (err: any) {
            setError(err.message || 'Failed to update assistant.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Assistant Editor</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="displayName" className="flex items-center text-sm font-medium text-gray-300">
                        Display Name (Read-only)
                        <InfoTooltip text="The name of the assistant as shown to users. This is currently read-only." />
                    </label>
                    <input type="text" name="displayName" value={formData.displayName} className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed" required disabled />
                </div>
                 <div>
                    <label htmlFor="webGroundingType" className="flex items-center text-sm font-medium text-gray-300">
                        Web Grounding Type
                        <InfoTooltip text="Enables the assistant to use Google Search for grounding its responses." />
                    </label>
                    <select name="webGroundingType" value={formData.webGroundingType} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm">
                        <option value="WEB_GROUNDING_TYPE_DISABLED">Disabled</option>
                        <option value="WEB_GROUNDING_TYPE_GOOGLE_SEARCH">Google Search</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="styleAndFormattingInstructions" className="flex items-center text-sm font-medium text-gray-300">
                        Style & Formatting Instructions
                        <InfoTooltip text="Guidelines for how the assistant should format its responses (e.g., specific tone, markdown usage)." />
                    </label>
                    <textarea name="styleAndFormattingInstructions" value={formData.styleAndFormattingInstructions} onChange={handleChange} rows={4} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" />
                </div>
                <div>
                    <label htmlFor="additionalSystemInstruction" className="flex items-center text-sm font-medium text-gray-300">
                        System Instruction
                        <InfoTooltip text="Core instructions that define the assistant's behavior and persona." />
                    </label>
                    <textarea name="additionalSystemInstruction" value={formData.additionalSystemInstruction} onChange={handleChange} rows={6} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" />
                </div>
                 <div>
                    <label htmlFor="customerPolicy" className="flex items-center text-sm font-medium text-gray-300">
                        Customer Policy (JSON)
                        <InfoTooltip text="JSON configuration for defining customer-specific policies." />
                    </label>
                    <textarea name="customerPolicy" value={formData.customerPolicy} onChange={handleChange} rows={5} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm font-mono text-xs" />
                </div>

                <CollapsibleSection title="Feature Management">
                    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <div className="flex items-center">
                                <input type="checkbox" name="enableEndUserAgentCreation" checked={Boolean(formData.enableEndUserAgentCreation)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-gray-300 ml-3">Enable End-User Agent Creation</span>
                                <InfoTooltip text="Allows end-users to create their own custom agents within the chat interface." />
                            </div>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <div className="flex items-center">
                                <input type="checkbox" name="disableLocationContext" checked={Boolean(formData.disableLocationContext)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-gray-300 ml-3">Disable Location Context</span>
                                <InfoTooltip text="Prevents the location context from being sent to the agent. useful for privacy or testing." />
                            </div>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <div className="flex items-center">
                                <input type="checkbox" name="defaultWebGroundingToggleOff" checked={Boolean(formData.defaultWebGroundingToggleOff)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-gray-300 ml-3">Default Web Grounding to Off</span>
                                <InfoTooltip text="Sets the default state of the Web Grounding toggle in the chat UI to 'Off'." />
                            </div>
                        </label>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Advanced Configuration">
                    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
                        <div>
                            <label htmlFor="vertexAiSearchToolConfig" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                Vertex AI Search Tool Config (JSON)
                                <InfoTooltip text="Raw JSON configuration for the Vertex AI Search Tool. Caution: Invalid JSON here can break the search functionality." />
                            </label>
                            <textarea name="vertexAiSearchToolConfig" value={formData.vertexAiSearchToolConfig} onChange={handleChange} rows={5} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm font-mono text-xs" />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Editable Vertex AI Agent Configs */}
                <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-md font-semibold text-white mb-2">Vertex AI Agent Configs</h3>
                    <div className="space-y-4">
                        {agentConfigs.map((cfg, index) => (
                            <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-3">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-semibold text-gray-300">Agent #{index + 1}</h4>
                                    <button type="button" onClick={() => handleRemoveAgentConfig(index)} className="text-sm text-red-400 hover:text-red-300">Remove</button>
                                </div>
                                <div>
                                    <label className="flex items-center text-xs font-medium text-gray-400">
                                        Agent Engine
                                        <InfoTooltip text="The underlying reasoning engine for this agent." />
                                    </label>
                                    <select
                                        value={cfg.name}
                                        onChange={(e) => handleAgentConfigChange(index, 'name', e.target.value)}
                                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm"
                                        required
                                    >
                                        <option value="">{isLoadingEngines ? 'Loading engines...' : '-- Select an Engine --'}</option>
                                        {availableEngines.map(engine => (
                                            <option key={engine.name} value={engine.name}>
                                                {engine.displayName} ({engine.name.split('/')[3]})
                                            </option>
                                        ))}
                                    </select>
                                    {engineError && <p className="text-xs text-red-400 mt-1">{engineError}</p>}
                                </div>
                                <div>
                                    <label className="flex items-center text-xs font-medium text-gray-400">
                                        Display Name
                                        <InfoTooltip text="Name of the agent tool as exposed to the model." />
                                    </label>
                                    <input type="text" value={cfg.displayName} onChange={(e) => handleAgentConfigChange(index, 'displayName', e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" required />
                                </div>
                                <div>
                                    <label className="flex items-center text-xs font-medium text-gray-400">
                                        Tool Description
                                        <InfoTooltip text="Description of what this agent tool does, used by the model to decide when to call it." />
                                    </label>
                                    <textarea value={cfg.toolDescription} onChange={(e) => handleAgentConfigChange(index, 'toolDescription', e.target.value)} rows={2} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" required />
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={handleAddAgentConfig} className="mt-4 text-sm font-semibold text-blue-400 hover:text-blue-300">
                        + Add Vertex AI Agent Config
                    </button>
                </div>
                
                {error && <p className="text-red-400 text-sm">{error}</p>}
                {success && <p className="text-green-400 text-sm">{success}</p>}

                <div className="flex justify-end pt-4 border-t border-gray-700">
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800">
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>

            <div className="mt-6 space-y-4">
                {assistant.enabledTools && Object.keys(assistant.enabledTools).length > 0 && (
                     <CollapsibleSection title="Read-Only: Enabled Tools">
                         <pre className="text-xs bg-gray-900 p-2 rounded-md overflow-x-auto">
                             <code>{JSON.stringify(assistant.enabledTools, null, 2)}</code>
                         </pre>
                    </CollapsibleSection>
                )}

                {assistant.enabledActions && Object.keys(assistant.enabledActions).length > 0 && (
                     <CollapsibleSection title="Read-Only: Enabled Actions">
                         <pre className="text-xs bg-gray-900 p-2 rounded-md overflow-x-auto">
                             <code>{JSON.stringify(assistant.enabledActions, null, 2)}</code>
                         </pre>
                    </CollapsibleSection>
                )}
            </div>
        </div>
    );
};

export default AssistantDetailsForm;