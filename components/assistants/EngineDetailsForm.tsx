import React, { useState, useEffect } from 'react';
import { AppEngine, Config } from '../../types';
import * as api from '../../services/apiService';
import InfoTooltip from '../InfoTooltip';

interface EngineDetailsFormProps {
    engine: AppEngine;
    config: Config;
    onUpdateSuccess: (updatedEngine: AppEngine) => void;
}

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

const EngineDetailsForm: React.FC<EngineDetailsFormProps> = ({ engine, config, onUpdateSuccess }) => {
    const [formData, setFormData] = useState({
        displayName: '',
        disableAnalytics: false,
    });
    const [features, setFeatures] = useState<Record<string, boolean>>({});
    const [modelConfigs, setModelConfigs] = useState<Record<string, boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Known features list from API docs
    // Mapped to descriptive tooltips
    const FEATURE_INFO: Record<string, string> = {
        'agent-gallery': 'Enables the Agent Gallery for discovering and using agents.',
        'no-code-agent-builder': 'Allows users to build agents without writing code.',
        'prompt-gallery': 'Provides a library of example prompts.',
        'model-selector': 'Lets users switch between different AI models.',
        'notebook-lm': 'Enables NotebookLM features for document analysis.',
        'people-search': 'Allows searching for people within the organization.',
        'people-search-org-chart': 'Displays organizational charts in people search results.',
        'bi-directional-audio': 'Enables two-way audio interaction.',
        'feedback': 'Allows users to provide feedback on responses.',
        'session-sharing': 'Enables users to share their chat sessions.',
        'personalization-memory': 'Allows the AI to remember user preferences and context.',
        'disable-agent-sharing': 'Prevents users from sharing custom agents.',
        'disable-image-generation': 'Disables image generation capabilities.',
        'disable-video-generation': 'Disables video generation capabilities.',
        'disable-onedrive-upload': 'Prevents uploading files from OneDrive.',
        'disable-talk-to-content': 'Disables Q&A on specific content.',
        'disable-google-drive-upload': 'Prevents uploading files from Google Drive.'
    };

    const KNOWN_FEATURES = Object.keys(FEATURE_INFO);

    // Known model configs list
    const KNOWN_MODELS = [
        'gemini-3-pro-preview',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
        'gemini-3-flash-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash'
    ];

    useEffect(() => {
        setFormData({
            displayName: engine.displayName || '',
            disableAnalytics: (engine as any).disableAnalytics || false,
        });

        const currentFeatures: Record<string, boolean> = {};
        // Initialize all known features to false/off unless present in engine
        KNOWN_FEATURES.forEach(f => {
            currentFeatures[f] = engine.features?.[f] === 'FEATURE_STATE_ON';
        });
        // Also capture any other features present in the engine
        if (engine.features) {
            Object.keys(engine.features).forEach(key => {
                currentFeatures[key] = engine.features![key] === 'FEATURE_STATE_ON';
            });
        }
        setFeatures(currentFeatures);

        const currentModels: Record<string, boolean> = {};
        // Initialize known models or those present in engine
        KNOWN_MODELS.forEach(m => {
            currentModels[m] = engine.modelConfigs?.[m] === 'MODEL_ENABLED';
        });
        if (engine.modelConfigs) {
            Object.keys(engine.modelConfigs).forEach(key => {
                currentModels[key] = engine.modelConfigs![key] === 'MODEL_ENABLED';
            });
        }
        setModelConfigs(currentModels);
    }, [engine]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleFeatureChange = (feature: string) => {
        setFeatures(prev => ({
            ...prev,
            [feature]: !prev[feature]
        }));
    };

    const handleModelChange = (model: string) => {
        setModelConfigs(prev => ({
            ...prev,
            [model]: !prev[model]
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const payload: any = {};
            const updateMask: string[] = [];

            if (formData.displayName !== engine.displayName) {
                payload.displayName = formData.displayName;
                updateMask.push('displayName');
            }

            if (formData.disableAnalytics !== ((engine as any).disableAnalytics || false)) {
                payload.disableAnalytics = formData.disableAnalytics;
                updateMask.push('disableAnalytics');
            }

            // Calculate changed features
            const newFeaturesMap: Record<string, string> = { ...engine.features };
            let featuresChanged = false;

            Object.entries(features).forEach(([key, isEnabled]) => {
                const newState = isEnabled ? 'FEATURE_STATE_ON' : 'FEATURE_STATE_OFF';
                if (newFeaturesMap[key] !== newState) {
                    newFeaturesMap[key] = newState;
                    featuresChanged = true;
                }
            });

            if (featuresChanged) {
                payload.features = newFeaturesMap;
                updateMask.push('features');
            }

            // Calculate changed model configs
            const newModelConfigsMap: Record<string, string> = { ...engine.modelConfigs };
            let modelsChanged = false;

            Object.entries(modelConfigs).forEach(([key, isEnabled]) => {
                const newState = isEnabled ? 'MODEL_ENABLED' : 'MODEL_DISABLED';
                if (newModelConfigsMap[key] !== newState) {
                    newModelConfigsMap[key] = newState;
                    modelsChanged = true;
                }
            });

            if (modelsChanged) {
                payload.modelConfigs = newModelConfigsMap;
                updateMask.push('modelConfigs');
            }

            if (updateMask.length === 0) {
                setSuccess("No changes detected.");
                setTimeout(() => setSuccess(null), 3000);
                setIsSubmitting(false);
                return;
            }

            const updatedEngine = await api.updateEngine(engine.name, payload, updateMask, config);
            onUpdateSuccess(updatedEngine);
            setSuccess("Engine updated successfully!");
            setTimeout(() => setSuccess(null), 3000);

        } catch (err: any) {
            setError(err.message || 'Failed to update engine.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 mb-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Engine Configuration</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
                    <input type="text" name="displayName" value={formData.displayName} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-200" />
                </div>

                <div className="flex items-center space-x-3">
                    <input type="checkbox" name="disableAnalytics" id="disableAnalytics" checked={Boolean(formData.disableAnalytics)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="disableAnalytics" className="flex items-center text-sm font-medium text-gray-300">
                        Disable Analytics
                        <InfoTooltip text="Disables the collection of analytics data for this engine." />
                    </label>
                </div>

                <CollapsibleSection title="Feature Management">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900/30 rounded-md">
                        {KNOWN_FEATURES.map(feature => (
                            <label key={feature} className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-800 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={features[feature] || false}
                                    onChange={() => handleFeatureChange(feature)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                />
                                <span className="text-sm text-gray-300 break-words truncate">{feature}</span>
                                <InfoTooltip text={FEATURE_INFO[feature] || feature} />
                            </label>
                        ))}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Model Configuration">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900/30 rounded-md">
                        {KNOWN_MODELS.map(model => (
                            <label key={model} className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-800 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={modelConfigs[model] || false}
                                    onChange={() => handleModelChange(model)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                />
                                <span className="text-sm text-gray-300 break-words truncate">{model}</span>
                                {/* Generic tooltip for models as we don't have descriptions in api docs for each */}
                                <InfoTooltip text={`Enable or disable the ${model} model.`} />
                            </label>
                        ))}
                    </div>
                </CollapsibleSection>

                {error && <p className="text-red-400 text-sm">{error}</p>}
                {success && <p className="text-green-400 text-sm">{success}</p>}

                <div className="flex justify-end pt-4 border-t border-gray-700">
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800">
                        {isSubmitting ? 'Saving...' : 'Save Engine Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EngineDetailsForm;
