
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Config, Collection, DataStore, GcsBucket } from '../types';
import * as api from '../services/apiService';
import AgentDeploymentModal from '../components/agent-catalog/AgentDeploymentModal';

declare var JSZip: any;

// Define types for agent config and tools
interface AgentTool {
    type: 'VertexAiSearchTool';
    dataStoreId: string;
    variableName: string;
}

interface AgentConfig {
    name: string;
    description: string;
    model: string;
    instruction: string;
    tools: AgentTool[];
    useGoogleSearch: boolean;
    enableOAuth: boolean;
    authId: string;
}

const generatePythonCode = (config: AgentConfig): string => {
    const toolImports = new Set<string>();
    const toolInitializations: string[] = [];
    const toolListForAgent: string[] = [];
    let oauthToolCodeBlock = '';
    
    const agentClass = 'Agent';
    const agentImport = 'from google.adk.agents import Agent';

    config.tools.forEach(tool => {
        if (tool.type === 'VertexAiSearchTool') {
            toolImports.add('from google.adk.tools import VertexAiSearchTool');
            toolInitializations.push(
                `${tool.variableName} = VertexAiSearchTool(\n    data_store_id="${tool.dataStoreId}"\n)`
            );
            toolListForAgent.push(tool.variableName);
        }
    });

    if (config.useGoogleSearch) {
        toolImports.add('from google.adk.tools import google_search');
        // No initialization needed, just add the imported object to the list
        toolListForAgent.push('google_search');
    }
    
    if (config.enableOAuth) {
        toolImports.add('from google.adk.tools import ToolContext');
        toolImports.add('from google.oauth2.credentials import Credentials');
        toolImports.add('from googleapiclient.discovery import build');
        oauthToolCodeBlock = `
def get_email_from_token(access_token):
    """Get user info from access token"""
    credentials = Credentials(token=access_token)
    service = build('oauth2', 'v2', credentials=credentials)
    user_info = service.userinfo().get().execute()
    user_email = user_info.get('email')
    
    return user_email

def lazy_mask_token(access_token):
    """Mask access token for printing"""
    start_mask = access_token[:4]
    end_mask = access_token[-4:]
    
    return f"{start_mask}...{end_mask}"

def print_tool_context(tool_context: ToolContext):
    """ADK Tool to get email and masked token from Gemini Enterprise"""
    auth_id = os.getenv("AUTH_ID")
    
    # get access token using tool context
    access_token = tool_context.state[f"temp:{auth_id}"]
    
    # mask the token to be returned to the agent
    masked_token = lazy_mask_token(access_token)

    # get the user email using the token
    user_email = get_email_from_token(access_token)
    
    # store email in tool context in case you want to keep referring to it
    tool_context.state["user_email"] = user_email
    
    return {
        f"temp:{auth_id}": lazy_mask_token(access_token),
        "user_email": user_email
    }
`;
        toolListForAgent.push('print_tool_context');
    }

    const formatPythonString = (str: string) => {
        const needsTripleQuotes = str.includes('\n') || str.includes('"');
        if (needsTripleQuotes) {
            const escapedStr = str.replace(/"""/g, '\\"\\"\\"');
            return `"""${escapedStr}"""`;
        }
        return `"${str.replace(/"/g, '\\"')}"`;
    };

    const imports = [
        'import os',
        'from dotenv import load_dotenv',
        agentImport,
        'try:',
        '    from vertexai.agent_engines import AdkApp',
        'except ImportError:',
        '    from vertexai.preview.reasoning_engines import AdkApp',
        ...Array.from(toolImports),
    ].join('\n');

    const appWrapper = `
# Wrap the agent in an AdkApp object for deployment
app = AdkApp(agent=root_agent)
`;

    return `
${imports}

${oauthToolCodeBlock}
# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join('\n\n') : '# No additional tools defined'}

# Define the root agent
root_agent = ${agentClass}(
    name=${formatPythonString(config.name)},
    description=${formatPythonString(config.description)},
    model=os.getenv("MODEL", ${formatPythonString(config.model)}),
    instruction=${formatPythonString(config.instruction)},
    tools=[${toolListForAgent.join(', ')}],
)

${appWrapper}
`.trim();
};

const generateEnvFile = (config: AgentConfig, projectNumber: string, location: string): string => {
    const baseContent = `GOOGLE_GENAI_USE_VERTEXAI=TRUE
MODEL="${config.model}"
GOOGLE_CLOUD_PROJECT="${projectNumber}"
GOOGLE_CLOUD_LOCATION="${location}"`;

    const authContent = config.enableOAuth && config.authId 
        ? `\nAUTH_ID="${config.authId}"`
        : '';
    
    return (baseContent + authContent).trim();
};

const generateRequirementsFile = (config: AgentConfig): string => {
    const requirements = new Set([
        'google-cloud-aiplatform[adk,agent_engines]>=1.38', 
        'python-dotenv'
    ]);
    if (config.enableOAuth) {
        requirements.add('google-auth-oauthlib>=1.2.2');
        requirements.add('google-api-python-client');
    }
    return Array.from(requirements).join('\n');
};

const generateReadmeFile = (config: AgentConfig): string => {
    return `
# Agent Quickstart

This agent was created using the Gemini Enterprise Manager Agent Builder.

## Local Development

1.  **Unzip the files.**
2.  **Install dependencies:**
    \`\`\`sh
    pip install -r requirements.txt
    \`\`\`
3.  **Run the agent:**
    You can use the \`agent.py\` file to run or debug your agent locally.

## Deployment

Use the **"Deploy Agent"** button in the Agent Builder UI to deploy this agent directly to Google Cloud Vertex AI without manual steps.
`.trim();
};

interface AgentBuilderPageProps {
    projectNumber: string;
    onBuildTriggered: (buildId: string) => void;
}

const AgentBuilderPage: React.FC<AgentBuilderPageProps> = ({ projectNumber, onBuildTriggered }) => {
    const [agentConfig, setAgentConfig] = useState<AgentConfig>({
        name: '',
        description: 'An agent that can do awesome things.',
        model: 'gemini-2.5-flash',
        instruction: 'You are an awesome and helpful agent.',
        tools: [],
        useGoogleSearch: false,
        enableOAuth: false,
        authId: '',
    });
    
    // State for Vertex AI config
    const [vertexLocation, setVertexLocation] = useState('us-central1');

    const [generatedAgentCode, setGeneratedAgentCode] = useState('');
    const [generatedEnvCode, setGeneratedEnvCode] = useState('');
    const [generatedRequirementsCode, setGeneratedRequirementsCode] = useState('');
    const [generatedReadmeCode, setGeneratedReadmeCode] = useState('');
    
    const [activeTab, setActiveTab] = useState<'agent' | 'env' | 'requirements' | 'readme'>('agent');
    const [copySuccess, setCopySuccess] = useState('');
    
    // State for AI rewrite feature
    const [rewritingField, setRewritingField] = useState<string | null>(null);
    const [rewriteError, setRewriteError] = useState<string | null>(null);

    // State for tool builder UI
    const [toolBuilderConfig, setToolBuilderConfig] = useState({
        location: 'global',
        collectionId: 'default_collection',
        dataStoreId: ''
    });

    // State for dropdowns
    const [dataStores, setDataStores] = useState<DataStore[]>([]);
    const [isLoadingDataStores, setIsLoadingDataStores] = useState(false);

    // State for deployment
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      appLocation: toolBuilderConfig.location,
      collectionId: toolBuilderConfig.collectionId,
      appId: '',
      assistantId: ''
    }), [projectNumber, toolBuilderConfig.location, toolBuilderConfig.collectionId]);


    useEffect(() => {
        const agentCode = generatePythonCode(agentConfig);
        const envCode = generateEnvFile(agentConfig, projectNumber, vertexLocation);
        const reqsCode = generateRequirementsFile(agentConfig);
        const readmeCode = generateReadmeFile(agentConfig);
        
        setGeneratedAgentCode(agentCode);
        setGeneratedEnvCode(envCode);
        setGeneratedRequirementsCode(reqsCode);
        setGeneratedReadmeCode(readmeCode);
    }, [agentConfig, projectNumber, vertexLocation]);

    const handleAgentConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = isCheckbox ? (e.target as HTMLInputElement).checked : undefined;

        if (name === 'name') {
            // Replace spaces with underscores and remove invalid characters.
            const sanitizedValue = value.replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '').toLowerCase();
            setAgentConfig({ ...agentConfig, [name]: sanitizedValue });
        } else {
            setAgentConfig({ ...agentConfig, [name]: isCheckbox ? checked : value });
        }
    };
    
    const handleToolBuilderConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, value } = e.target;
      setToolBuilderConfig(prev => {
        const newConfig = {...prev, [name]: value};
        if (name === 'location') {
          newConfig.dataStoreId = '';
          setDataStores([]);
        }
        return newConfig;
      });
    };

    // Fetch data stores
    useEffect(() => {
      if (!projectNumber || !toolBuilderConfig.collectionId) return;
      const fetchDataStores = async () => {
        setIsLoadingDataStores(true);
        setDataStores([]);
        try {
          const res = await api.listResources('dataStores', apiConfig);
          const fetchedDataStores = res.dataStores || [];
          setDataStores(fetchedDataStores);
          if (fetchedDataStores.length === 1) {
            setToolBuilderConfig(prev => ({...prev, dataStoreId: fetchedDataStores[0].name}));
          }
        } catch (err) {
          console.error("Failed to fetch data stores", err);
        } finally {
          setIsLoadingDataStores(false);
        }
      };
      fetchDataStores();
    }, [projectNumber, toolBuilderConfig.location, apiConfig]);


    const handleAddTool = () => {
        if (!toolBuilderConfig.dataStoreId) {
            alert('Please select a data store.');
            return;
        }
        
        const dataStoreName = toolBuilderConfig.dataStoreId;
        const shortName = dataStoreName.split('/').pop()?.replace(/-/g, '_') || `datastore_${agentConfig.tools.length}`;
        const variableName = `${shortName}_tool`;

        const newTool: AgentTool = {
            type: 'VertexAiSearchTool',
            dataStoreId: dataStoreName,
            variableName: variableName,
        };
        setAgentConfig(prev => ({ ...prev, tools: [...prev.tools, newTool] }));
    };
    
    const handleRemoveTool = (index: number) => {
        setAgentConfig(prev => ({
            ...prev,
            tools: prev.tools.filter((_, i) => i !== index),
        }));
    };
    
    const handleRewrite = async (field: 'description' | 'instruction') => {
        setRewritingField(field);
        setRewriteError(null);
        const currentValue = agentConfig[field];
        if (!currentValue.trim()) {
            setRewriteError('Please enter some text to rewrite.');
            setRewritingField(null);
            return;
        }

        const toolsInfo = agentConfig.tools.map(tool => `- A Vertex AI Search tool connected to data store: ${tool.dataStoreId.split('/').pop()}`).join('\n');
        const googleSearchInfo = agentConfig.useGoogleSearch ? '- Google Search for real-time information.' : '';
        const capabilities = [toolsInfo, googleSearchInfo].filter(Boolean).join('\n');

        let prompt = '';
        if (field === 'description') {
            prompt = `Based on the agent's capabilities below, rewrite the following description to be a clear and compelling explanation of what this agent does for an end-user. The result should be a single, direct paragraph. Do not offer multiple options.

Agent Capabilities:
${capabilities || 'This agent has no special tools.'}

Original Description: "${currentValue}"

Rewritten Description:`;
        } else { // instruction field
            prompt = `Based on the agent's capabilities below, rewrite the following system instruction to effectively guide the agent's behavior and personality. The instruction should be clear, direct, and help the model understand its role. The result should be a single, direct paragraph. Do not offer multiple options.

Agent Capabilities:
${capabilities || 'This agent has no special tools.'}

Original Instruction: "${currentValue}"

Rewritten Instruction:`;
        }

        try {
            const text = await api.generateVertexContent(apiConfig, prompt);
            const rewrittenText = text.trim();
            // Clean up if the model returns markdown or quotes
            const cleanedText = rewrittenText.replace(/^["']|["']$/g, '').replace(/^```\w*\n?|\n?```$/g, '').trim();
            setAgentConfig(prev => ({ ...prev, [field]: cleanedText }));
        } catch (err: any) {
            setRewriteError(`AI rewrite failed: ${err.message}`);
        } finally {
            setRewritingField(null);
        }
    };


    const handleCopyCode = () => {
        let codeToCopy = '';
        switch (activeTab) {
            case 'agent': codeToCopy = generatedAgentCode; break;
            case 'env': codeToCopy = generatedEnvCode; break;
            case 'requirements': codeToCopy = generatedRequirementsCode; break;
            case 'readme': codeToCopy = generatedReadmeCode; break;
        }
        navigator.clipboard.writeText(codeToCopy).then(() => {
            setCopySuccess('Copied!');
            setTimeout(() => setCopySuccess(''), 2000);
        }, (err) => {
            setCopySuccess('Failed!');
            console.error('Could not copy text: ', err);
        });
    };

    const handleDownloadCode = async () => {
        const zip = new JSZip();
        zip.file('agent.py', generatedAgentCode);
        zip.file('.env', generatedEnvCode);
        zip.file('requirements.txt', generatedRequirementsCode);
        zip.file('README.md', generatedReadmeCode);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${agentConfig.name || 'unnamed'}-agent.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleBuildTriggered = (buildId: string) => {
        onBuildTriggered(buildId); // Notify parent
        setIsDeployModalOpen(false); // Close modal on success
    };
    
    const codeToDisplay = useMemo(() => {
        switch (activeTab) {
            case 'agent': return generatedAgentCode;
            case 'env': return generatedEnvCode;
            case 'requirements': return generatedRequirementsCode;
            case 'readme': return generatedReadmeCode;
            default: return '';
        }
    }, [activeTab, generatedAgentCode, generatedEnvCode, generatedRequirementsCode, generatedReadmeCode]);

    const deployFiles = useMemo(() => [
        { name: 'agent.py', content: generatedAgentCode },
        { name: 'requirements.txt', content: generatedRequirementsCode },
        { name: 'README.md', content: generatedReadmeCode },
        // Pass .env content as .env.example so the deployment modal parses it for configuration variables
        { name: '.env.example', content: generatedEnvCode }
    ], [generatedAgentCode, generatedRequirementsCode, generatedReadmeCode, generatedEnvCode]);
    
    
    const AiRewriteButton: React.FC<{ field: 'description' | 'instruction' }> = ({ field }) => {
        const isRewriting = rewritingField === field;
        return (
            <button
                type="button"
                onClick={() => handleRewrite(field)}
                disabled={isRewriting}
                className="p-1.5 text-gray-400 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors disabled:bg-gray-600"
                title={`Rewrite ${field} with AI`}
            >
                {isRewriting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                        <path d="M12.736 3.97a6 6 0 014.243 4.243l2.022-2.022a1 1 0 10-1.414-1.414L15.56 6.8A6.002 6.002 0 0112.736 3.97zM3.97 12.736a6 6 0 01-1.243-5.222L4.75 9.536a1 1 0 001.414-1.414L4.142 6.1A6.002 6.002 0 013.97 12.736z" />
                    </svg>
                )}
            </button>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full relative">
            {isDeployModalOpen && (
                <AgentDeploymentModal
                    isOpen={isDeployModalOpen}
                    onClose={() => setIsDeployModalOpen(false)}
                    agentName={agentConfig.name || 'unnamed_agent'}
                    files={deployFiles}
                    projectNumber={projectNumber}
                    onBuildTriggered={handleBuildTriggered}
                />
            )}
            
            {/* Left Panel: Configuration */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col gap-4 overflow-y-auto">
                <h2 className="text-xl font-semibold text-white">Agent Configuration</h2>
                
                {/* Agent Details */}
                <div className="space-y-3 p-3 bg-gray-900/50 rounded-md">
                    {rewriteError && <p className="text-red-400 text-sm mb-2">{rewriteError}</p>}
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Agent Name</label>
                        <input type="text" name="name" value={agentConfig.name} onChange={handleAgentConfigChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2" placeholder="e.g., my_awesome_agent" />
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-gray-400">Description</label>
                            <AiRewriteButton field="description" />
                        </div>
                        <textarea name="description" value={agentConfig.description} onChange={handleAgentConfigChange} rows={3} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2" placeholder="A brief description of the agent's purpose."></textarea>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-400">Google Cloud Project</label>
                        <div className="mt-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                            {projectNumber || <span className="text-gray-500 italic">Not set (configure on Agents page)</span>}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Google Cloud Location (Vertex AI)</label>
                        <select value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[42px]">
                            <option value="us-central1">us-central1</option>
                            <option value="us-east1">us-east1</option>
                            <option value="us-east4">us-east4</option>
                            <option value="us-west1">us-west1</option>
                            <option value="europe-west1">europe-west1</option>
                            <option value="europe-west2">europe-west2</option>
                            <option value="europe-west4">europe-west4</option>
                            <option value="asia-east1">asia-east1</option>
                            <option value="asia-southeast1">asia-southeast1</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-400">Model</label>
                         <select 
                            name="model" 
                            value={agentConfig.model} 
                            onChange={handleAgentConfigChange} 
                            className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[42px]"
                        >
                            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                        </select>
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-gray-400">System Instruction</label>
                            <AiRewriteButton field="instruction" />
                        </div>
                        <textarea name="instruction" value={agentConfig.instruction} onChange={handleAgentConfigChange} rows={5} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2" placeholder="Instructions for the agent's behavior and personality."></textarea>
                    </div>
                </div>

                {/* Built-in Tools */}
                <div className="space-y-3 p-3 bg-gray-900/50 rounded-md">
                    <h3 className="text-lg font-semibold text-white">Built-in Tools &amp; Features</h3>
                    <div className="flex items-center">
                        <input 
                            type="checkbox" 
                            id="useGoogleSearch"
                            name="useGoogleSearch"
                            checked={agentConfig.useGoogleSearch}
                            onChange={handleAgentConfigChange}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                        />
                        <label htmlFor="useGoogleSearch" className="ml-2 text-sm font-medium text-gray-300">Google Search</label>
                    </div>
                     <p className="text-xs text-gray-500 pl-6 -mt-2">Provides the agent with real-time access to Google Search.</p>
                </div>
                
                {/* Authentication Section */}
                <div className="space-y-3 p-3 bg-gray-900/50 rounded-md">
                    <h3 className="text-lg font-semibold text-white">Authentication</h3>
                    <div className="flex items-center">
                        <input 
                            type="checkbox" 
                            id="enableOAuth"
                            name="enableOAuth"
                            checked={agentConfig.enableOAuth}
                            onChange={handleAgentConfigChange}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                        />
                        <label htmlFor="enableOAuth" className="ml-2 text-sm font-medium text-gray-300">Enable OAuth (Adds a sample tool)</label>
                    </div>
                    {agentConfig.enableOAuth && (
                        <div className="pl-6">
                            <label className="block text-sm font-medium text-gray-400">Authorization ID (AUTH_ID)</label>
                            <input
                                type="text"
                                name="authId"
                                value={agentConfig.authId}
                                onChange={handleAgentConfigChange}
                                className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[42px]"
                                placeholder="e.g., my-google-workspace-auth"
                            />
                            <p className="text-xs text-gray-500 mt-1">The ID of the Authorization object in Gemini Enterprise. This will be set as the AUTH_ID environment variable.</p>
                        </div>
                    )}
                </div>

                {/* Tool Builder */}
                <div className="space-y-3 p-3 bg-gray-900/50 rounded-md">
                    <h3 className="text-lg font-semibold text-white">Add Vertex AI Search Tool</h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Location</label>
                        <select name="location" value={toolBuilderConfig.location} onChange={handleToolBuilderConfigChange} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[42px]">
                            <option value="global">global</option><option value="us">us</option><option value="eu">eu</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Data Store</label>
                        <select name="dataStoreId" value={toolBuilderConfig.dataStoreId} onChange={(e) => setToolBuilderConfig(p => ({...p, dataStoreId: e.target.value}))} disabled={isLoadingDataStores} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[42px]">
                            <option value="">{isLoadingDataStores ? 'Loading...' : '-- Select Data Store --'}</option>
                            {dataStores.map(ds => <option key={ds.name} value={ds.name}>{ds.displayName}</option>)}
                        </select>
                    </div>
                    <button onClick={handleAddTool} disabled={!toolBuilderConfig.dataStoreId} className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500">
                        Add Tool to Agent
                    </button>
                </div>
                
                {/* Added Tools */}
                {agentConfig.tools.length > 0 && (
                    <div className="space-y-2 p-3 bg-gray-900/50 rounded-md">
                        <h3 className="text-lg font-semibold text-white">Agent's Custom Tools</h3>
                        {agentConfig.tools.map((tool, index) => (
                            <div key={index} className="flex justify-between items-center bg-gray-700 p-2 rounded-md">
                                <div>
                                    <p className="text-sm font-medium text-white">{tool.type}</p>
                                    <p className="text-xs font-mono text-gray-400">{tool.dataStoreId.split('/').pop()}</p>
                                </div>
                                <button onClick={() => handleRemoveTool(index)} className="p-1 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                }
            </div>

            {/* Right Panel: Code Preview & Deploy */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col gap-4">
                 {/* Code Preview Section */}
                 <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <div className="flex border-b border-gray-700">
                                <button onClick={() => setActiveTab('agent')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'agent' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>agent.py</button>
                                <button onClick={() => setActiveTab('env')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'env' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>.env</button>
                                <button onClick={() => setActiveTab('requirements')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'requirements' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>requirements.txt</button>
                                <button onClick={() => setActiveTab('readme')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'readme' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>README.md</button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCopyCode} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 w-24">
                                {copySuccess || 'Copy'}
                            </button>
                        </div>
                    </div>
                    <div className="bg-gray-900 rounded-md flex-1 overflow-auto">
                        <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap">
                            <code>
                                {codeToDisplay}
                            </code>
                        </pre>
                    </div>
                </div>

                {/* Export & Deploy Section */}
                <div className="space-y-4 p-3 bg-gray-900/50 rounded-md">
                    <h2 className="text-xl font-semibold text-white">Deploy</h2>
                    <p className="text-sm text-gray-400 mb-2">
                        Deploy directly to Google Cloud using Cloud Build. No local setup required.
                    </p>
                    <div className="flex gap-3">
                        <button onClick={() => setIsDeployModalOpen(true)} className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg transform transition-transform active:scale-95 flex justify-center items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                            Deploy Agent
                        </button>
                        <button onClick={handleDownloadCode} className="px-4 py-3 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-gray-500" title="Download Source Code (.zip)">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentBuilderPage;
