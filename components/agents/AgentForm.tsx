import React, { useState, useEffect } from 'react';
import { Agent, ReasoningEngine, Config, Authorization } from '../../types';
import * as api from '../../services/apiService';

const getCompatibleReasoningEngineLocation = (appLocation: string): string => {
    switch (appLocation) {
        case 'us':
        case 'global':
            return 'us-central1';
        case 'eu':
            return 'europe-west1';
        default:
            // This case shouldn't be hit with the current dropdown, but as a fallback:
            return 'us-central1'; 
    }
};

interface AgentFormProps {
  config: Config;
  onSuccess: () => void;
  onCancel: () => void;
  agentToEdit?: Agent | null;
}

const AgentForm: React.FC<AgentFormProps> = ({ config, onSuccess, onCancel, agentToEdit }) => {
  const [formData, setFormData] = useState({
    displayName: 'My New Agent',
    description: 'An agent registered via the web UI.',
    agentId: '', // For specifying name on create
    iconUri: 'https://www.svgrepo.com/show/533810/chef-man-cap.svg',
    toolDescription: 'A tool that can do amazing things.',
    reasoningEngineLocation: 'us-central1',
    reasoningEngineId: '901164128171720704',
    authId: '',
    starterPrompts: [''],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconPreviewError, setIconPreviewError] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<object | null>(null);

  const [reasoningEngines, setReasoningEngines] = useState<ReasoningEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [engineLoadError, setEngineLoadError] = useState<string | null>(null);
  
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [authLoadError, setAuthLoadError] = useState<string | null>(null);
  const [authInputMode, setAuthInputMode] = useState<'manual' | 'select'>('manual');

  const isEditingDisabled = agentToEdit && !agentToEdit.state;

  useEffect(() => {
    // When the form loads or the config (appLocation) changes,
    // automatically set the compatible reasoning engine location.
    const compatibleLocation = getCompatibleReasoningEngineLocation(config.appLocation);
    setFormData(prev => ({ ...prev, reasoningEngineLocation: compatibleLocation }));
  }, [config.appLocation]);

  useEffect(() => {
    if (agentToEdit) {
      const rePath = agentToEdit.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine || '';
      const reParts = rePath.split('/');
      
      setFormData({
        displayName: agentToEdit.displayName || '',
        description: agentToEdit.description || '',
        agentId: '', // Not used for editing
        iconUri: agentToEdit.icon?.uri || '',
        toolDescription: agentToEdit.adkAgentDefinition?.toolSettings?.toolDescription || '',
        reasoningEngineLocation: reParts.length > 3 ? reParts[3] : getCompatibleReasoningEngineLocation(config.appLocation),
        reasoningEngineId: reParts.length > 5 ? reParts[5] : '',
        authId: (agentToEdit.authorizations?.[0] || '').split('/').pop() || '',
        starterPrompts: agentToEdit.starterPrompts && agentToEdit.starterPrompts.length > 0
            ? agentToEdit.starterPrompts.map(p => p.text)
            : [''],
      });
    }
  }, [agentToEdit, config.appLocation]);

  // Effect to generate the JSON preview payload when editing
  useEffect(() => {
    if (!agentToEdit) {
      setPreviewPayload(null);
      return;
    }

    const finalStarterPrompts = formData.starterPrompts
        .map(text => text.trim())
        .filter(text => text)
        .map(text => ({ text }));

    const payload: Partial<Agent> = {
        displayName: formData.displayName,
        description: formData.description,
        icon: formData.iconUri ? { uri: formData.iconUri } : undefined,
        starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
        adkAgentDefinition: {
            toolSettings: { toolDescription: formData.toolDescription },
            provisionedReasoningEngine: {
              reasoningEngine: `projects/${config.projectId}/locations/${formData.reasoningEngineLocation}/reasoningEngines/${formData.reasoningEngineId}`,
            },
        },
    };

    setPreviewPayload(payload);

  }, [formData, agentToEdit, config.projectId]);

  useEffect(() => {
    setIconPreviewError(false);
  }, [formData.iconUri]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  const handleStarterPromptChange = (index: number, value: string) => {
    const newPrompts = [...formData.starterPrompts];
    newPrompts[index] = value;
    setFormData({ ...formData, starterPrompts: newPrompts });
  };

  const addStarterPrompt = () => {
    setFormData({ ...formData, starterPrompts: [...formData.starterPrompts, ''] });
  };

  const removeStarterPrompt = (index: number) => {
    if (formData.starterPrompts.length <= 1) { // Always keep at least one input
        setFormData({ ...formData, starterPrompts: [''] });
        return;
    }
    const newPrompts = formData.starterPrompts.filter((_, i) => i !== index);
    setFormData({ ...formData, starterPrompts: newPrompts });
  };

  const handleLoadEngines = async () => {
    if (!formData.reasoningEngineLocation) {
        setEngineLoadError("Please enter a location to load engines from.");
        return;
    }
    setIsLoadingEngines(true);
    setEngineLoadError(null);
    setReasoningEngines([]);
    try {
        const engineConfig = { ...config, reasoningEngineLocation: formData.reasoningEngineLocation };
        const response = await api.listReasoningEngines(engineConfig);
        setReasoningEngines(response.reasoningEngines || []);
        if (!response.reasoningEngines || response.reasoningEngines.length === 0) {
            setEngineLoadError(`No reasoning engines found in ${formData.reasoningEngineLocation}.`);
        }
    } catch (err: any) {
        setEngineLoadError(err.message || "Failed to load reasoning engines.");
    } finally {
        setIsLoadingEngines(false);
    }
  };
  
  const handleLoadAuthorizations = async () => {
    setIsLoadingAuths(true);
    setAuthLoadError(null);
    setAuthorizations([]);
    try {
        const response = await api.listAuthorizations(config);
        const auths = response.authorizations || [];
        setAuthorizations(auths);
        if (auths.length === 0) {
            setAuthLoadError("No authorizations found for this project.");
            setAuthInputMode('manual'); // Stay in manual mode if none found
        } else {
            setAuthLoadError(null); // Clear previous error on success
            setAuthInputMode('select'); // Switch to select mode on success
        }
    } catch (err: any) {
        setAuthLoadError(err.message || "Failed to load authorizations.");
    } finally {
        setIsLoadingAuths(false);
    }
  };

  const handleEngineSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const engineName = e.target.value;
    const selectedEngine = reasoningEngines.find(engine => engine.name === engineName);
    if (selectedEngine) {
        const id = selectedEngine.name.split('/').pop();
        setFormData(prev => ({ ...prev, reasoningEngineId: id || '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditingDisabled) return;
    
    setIsSubmitting(true);
    setError(null);

    const finalStarterPrompts = formData.starterPrompts
        .map(text => text.trim())
        .filter(text => text)
        .map(text => ({ text }));
    
    const reasoningEnginePath = `projects/${config.projectId}/locations/${formData.reasoningEngineLocation}/reasoningEngines/${formData.reasoningEngineId}`;

    try {
      if (agentToEdit) {
        // Build the payload for the update using the camelCase Agent type
        const agentPayload: Partial<Agent> = {
            displayName: formData.displayName,
            description: formData.description,
            icon: { uri: formData.iconUri },
            starterPrompts: finalStarterPrompts,
            adkAgentDefinition: {
                toolSettings: { toolDescription: formData.toolDescription },
                provisionedReasoningEngine: {
                  reasoningEngine: reasoningEnginePath,
                },
            },
        };
        await api.updateAgent(agentToEdit, agentPayload, config);
      } else {
        // Build the payload for creation
        const createPayload: any = {
            displayName: formData.displayName,
            description: formData.description,
            icon: { uri: formData.iconUri },
            starterPrompts: finalStarterPrompts.length > 0 ? finalStarterPrompts : undefined,
            adkAgentDefinition: {
                tool_settings: { tool_description: formData.toolDescription },
                provisioned_reasoning_engine: {
                  reasoning_engine: reasoningEnginePath,
                },
            },
        };
        
        // Add optional user-specified agent ID as 'name'
        if (formData.agentId.trim()) {
            createPayload.name = formData.agentId.trim();
        }
    
        const finalAuthId = formData.authId?.split('/').pop()?.trim();
        if (finalAuthId) {
            createPayload.authorizationConfig = {
                authorization_type: 'OAUTH_CLIENT_ID',
                oauth_client_id: `projects/${config.projectId}/locations/global/authorizations/${finalAuthId}`,
            };
        }
        
        await api.createAgent(createPayload, config);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save agent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`bg-gray-800 shadow-xl rounded-lg p-6 ${agentToEdit ? 'max-w-7xl' : 'max-w-2xl'} mx-auto`}>
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-2xl font-bold text-white">{agentToEdit ? 'Update Agent' : 'Register New Agent'}</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white">&larr; Back to list</button>
      </div>
      
      {isEditingDisabled && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-sm rounded-md p-3 mb-6" role="alert">
            Editing is disabled for this agent because it is a private no-code agent. Its configuration cannot be modified.
        </div>
      )}

      <div className={agentToEdit ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : ""}>
        {/* Column 1: The Form */}
        <form id="agent-form" onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={isEditingDisabled} className="space-y-4">
                {/* Fields */}
                <div><label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label><input type="text" name="displayName" value={formData.displayName} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required /></div>
                <div><label htmlFor="description" className="block text-sm font-medium text-gray-300">Description</label><textarea name="description" value={formData.description} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required /></div>
                {!agentToEdit && (
                  <div>
                    <label htmlFor="agentId" className="block text-sm font-medium text-gray-300">Agent ID (Optional)</label>
                    <input type="text" name="agentId" value={formData.agentId} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" pattern="[a-z0-9-]{1,63}" title="Must be lowercase letters, numbers, and hyphens, up to 63 characters." />
                    <p className="mt-1 text-xs text-gray-400">If left blank, a unique ID will be generated. Must be lowercase, numbers, and hyphens.</p>
                  </div>
                )}
                <div>
                    <label htmlFor="iconUri" className="block text-sm font-medium text-gray-300">Icon URI</label>
                    <input type="text" name="iconUri" value={formData.iconUri} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" />
                    {formData.iconUri && !iconPreviewError && (
                    <img
                        src={formData.iconUri}
                        alt="Icon Preview"
                        className="mt-2 h-16 w-16 rounded-md object-cover bg-gray-600"
                        onError={() => setIconPreviewError(true)}
                    />
                    )}
                </div>
                
                <div className="border-t border-gray-700 pt-4">
                    <label className="block text-sm font-medium text-gray-300">Starter Prompts</label>
                    <p className="mt-1 text-xs text-gray-400">Suggestions to show the user on the agent's landing page.</p>
                    <div className="mt-2 space-y-2">
                        {formData.starterPrompts.map((prompt, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={prompt}
                                    onChange={(e) => handleStarterPromptChange(index, e.target.value)}
                                    placeholder={`Prompt #${index + 1}`}
                                    className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeStarterPrompt(index)}
                                    className="p-2 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md disabled:bg-gray-600 disabled:cursor-not-allowed"
                                    aria-label="Remove prompt"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={addStarterPrompt}
                        className="mt-2 text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                        + Add Prompt
                    </button>
                </div>

                <div>
                    <label htmlFor="authId" className="block text-sm font-medium text-gray-300">
                        Authorization ID {agentToEdit ? '(Immutable)' : '(Optional)'}
                    </label>
                    {agentToEdit ? (
                        <>
                            <input
                                type="text"
                                name="authId"
                                value={formData.authId}
                                className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-gray-400"
                                disabled
                            />
                            <p className="mt-1 text-xs text-gray-400">Authorization cannot be changed after an agent is created.</p>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center space-x-2 mt-1">
                                {authInputMode === 'select' && authorizations.length > 0 ? (
                                    <>
                                        <select name="authId" value={formData.authId} onChange={handleChange} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm">
                                            <option value="">-- Select an Authorization --</option>
                                            {authorizations.map(auth => {
                                                const authId = auth.name.split('/').pop() || '';
                                                return <option key={auth.name} value={authId}>{authId}</option>;
                                            })}
                                        </select>
                                        <button type="button" onClick={() => setAuthInputMode('manual')} className="text-sm text-blue-400 hover:text-blue-300 shrink-0">
                                            Enter Manually
                                        </button>
                                    </>
                                ) : (
                                    <input type="text" name="authId" value={formData.authId} onChange={handleChange} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" placeholder="Type an ID or click Load" />
                                )}
                                <button type="button" onClick={handleLoadAuthorizations} disabled={isLoadingAuths} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500 shrink-0" title="Load available authorizations">
                                    {isLoadingAuths ? '...' : 'Load'}
                                </button>
                            </div>
                            {authLoadError && <p className="mt-1 text-sm text-red-400">{authLoadError}</p>}
                        </>
                    )}
                </div>

                <div className="space-y-4 border-t border-gray-700 p-4 rounded-md">
                    <h3 className="text-lg font-semibold text-white">ADK Agent Details</h3>
                    <div><label htmlFor="toolDescription" className="block text-sm font-medium text-gray-300">Tool Description (Prompt)</label><textarea name="toolDescription" value={formData.toolDescription} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required /></div>
                    <div>
                        <label htmlFor="reasoningEngineLocation" className="block text-sm font-medium text-gray-300">Reasoning Engine Location</label>
                        <div className="flex items-center space-x-2 mt-1">
                            <input 
                                type="text" 
                                name="reasoningEngineLocation" 
                                value={formData.reasoningEngineLocation} 
                                className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed"
                                disabled={isEditingDisabled}
                                readOnly 
                            />
                            <button type="button" onClick={handleLoadEngines} disabled={isLoadingEngines || !formData.reasoningEngineLocation || isEditingDisabled} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500">{isLoadingEngines ? '...' : 'Load'}</button>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">This is automatically set based on the Agent's Location (`{config.appLocation}`) to ensure compatibility.</p>
                    </div>
                    {engineLoadError && <p className="text-sm text-red-400">{engineLoadError}</p>}
                    {reasoningEngines.length > 0 && (
                        <div>
                            <label htmlFor="engineSelect" className="block text-sm font-medium text-gray-300">Select an Engine</label>
                            <select id="engineSelect" onChange={handleEngineSelect} value={reasoningEngines.find(re => re.name.endsWith(`/${formData.reasoningEngineId}`))?.name || ''} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-white disabled:bg-gray-700/50 disabled:cursor-not-allowed">
                                <option value="">-- Manually Entered --</option>
                                {reasoningEngines.map(engine => (<option key={engine.name} value={engine.name}>{engine.displayName} ({engine.name.split('/').pop()})</option>))}
                            </select>
                        </div>
                    )}
                    <div><label htmlFor="reasoningEngineId" className="block text-sm font-medium text-gray-300">Reasoning Engine ID</label><input type="text" name="reasoningEngineId" value={formData.reasoningEngineId} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed" required /></div>
                </div>
            </fieldset>
        </form>

        {/* Column 2: The Preview */}
        {agentToEdit && previewPayload && (
            <div>
                 <h3 className="text-xl font-semibold text-white">Update Payload Preview</h3>
                 <div className="bg-gray-900 rounded-lg p-4 mt-2" style={{maxHeight: 'calc(100vh - 25rem)', overflowY: 'auto'}}>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                        <code>
                            {JSON.stringify(previewPayload, null, 2)}
                        </code>
                    </pre>
                 </div>
            </div>
        )}
      </div>

       {/* Buttons and Error outside the grid, at the bottom of the component */}
      <div className="mt-6">
        {error && <p className="text-red-400 mb-4 text-center">{error}</p>}
        <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
            <button type="submit" form="agent-form" disabled={isSubmitting || isEditingDisabled} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed">{isSubmitting ? 'Saving...' : 'Save Agent'}</button>
        </div>
      </div>
    </div>
  );
};

export default AgentForm;