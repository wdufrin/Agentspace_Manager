import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Config, Collection, DataStore, GcsBucket } from '../types';
import * as api from '../services/apiService';
import DeployModal from '../components/agent-builder/DeployModal';
import { GoogleGenAI } from "@google/genai";

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

export interface DeployInfo {
    engineName: string;
    gcsStagingUri: string;
    location: string;
    deployMode: 'existing' | 'new';
    newEngineDisplayName: string;
    pickleGcsUri: string;
}

// Defer AI client initialization to avoid crash on load
let ai: GoogleGenAI | null = null;
const getAiClient = () => {
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    }
    return ai;
};

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
        'from vertexai.preview.reasoning_engines import AdkApp',
        ...Array.from(toolImports),
    ].join('\n');


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

# Wrap the agent in an AdkApp object for deployment
app = AdkApp(agent=root_agent)
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
        'google-cloud-aiplatform[adk,agent_engines]<1.17.0', 
        'python-dotenv'
    ]);
    if (config.enableOAuth) {
        requirements.add('google-auth-oauthlib>=1.2.2');
        requirements.add('google-api-python-client');
    }
    return Array.from(requirements).join('\n');
};

const generateCreatePickleFile = (): string => {
    return `
import pickle
from agent import app

# This script serializes the 'app' object from your agent.py file
# into a pickle file named 'agent.pkl'.

try:
    with open('agent.pkl', 'wb') as f:
        pickle.dump(app, f)
    print("\\n✅ Successfully created agent.pkl\\n")
except Exception as e:
    print(f"\\n❌ Error creating pickle file: {e}\\n")
`.trim();
};

const generateReadmeFile = (): string => {
    return `
# Agent Quickstart

You have successfully generated the Python source code for your agent. Follow these steps to create the \`agent.pkl\` file required for deployment.

## Prerequisites

- Python 3.10 or later installed.
- \`pip\` and \`venv\` (usually included with Python).

## Steps

### 1. Set Up Your Local Environment

First, unzip the downloaded files (\`agent.py\`, \`.env\`, \`requirements.txt\`, \`create_pickle.py\`) into a new folder on your local machine.

Open your terminal and navigate into that folder:

\`\`\`sh
cd /path/to/your/agent-folder
\`\`\`

Create and activate a Python virtual environment. This keeps your project dependencies isolated.

\`\`\`sh
# Create the virtual environment
python3 -m venv venv

# Activate it (on macOS/Linux)
source venv/bin/activate

# Activate it (on Windows)
.\\venv\\Scripts\\activate
\`\`\`

### 2. Install Dependencies

Install the required Python libraries using the \`requirements.txt\` file.

\`\`\`sh
pip install -r requirements.txt
\`\`\`

### 3. Create the \`agent.pkl\` File

We have provided the \`create_pickle.py\` script to generate the required \`.pkl\` file.

Run the script from your terminal:

\`\`\`sh
python create_pickle.py
\`\`\`

If successful, you will see a new file named \`agent.pkl\` in your folder.

### 4. Next Steps: Upload and Deploy

You are now ready to deploy your agent.

1.  **Return to the Gemini Enterprise Manager UI.**
2.  Go to the **"Step 2: Upload Agent Package to GCS"** section.
3.  Select both the \`agent.pkl\` file you just created and the \`requirements.txt\` file.
4.  Upload them to your chosen GCS bucket.
5.  Proceed to the **"Step 3: Deploy to Reasoning Engine"** step to complete the deployment.
`.trim();
};


const AgentBuilderPage: React.FC<{ projectNumber: string; }> = ({ projectNumber }) => {
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
    const [generatedCreatePickleCode, setGeneratedCreatePickleCode] = useState('');
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

    // State for GCS Upload
    const [gcsUploadBucket, setGcsUploadBucket] = useState('');
    const [gcsUploadPath, setGcsUploadPath] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadLogs, setUploadLogs] = useState<string[]>([]);
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [bucketLoadError, setBucketLoadError] = useState<string | null>(null);
    const [pickleFile, setPickleFile] = useState<File | null>(null);
    const [requirementsFile, setRequirementsFile] = useState<File | null>(null);
    
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
        const readmeCode = generateReadmeFile();
        const createPickleCode = generateCreatePickleFile();
        setGeneratedAgentCode(agentCode);
        setGeneratedEnvCode(envCode);
        setGeneratedRequirementsCode(reqsCode);
        setGeneratedReadmeCode(readmeCode);
        setGeneratedCreatePickleCode(createPickleCode);
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
            const response = await getAiClient().models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            const rewrittenText = response.text.trim();
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
        zip.file('create_pickle.py', generatedCreatePickleCode);
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

     const handleDeploy = async (deployInfo: DeployInfo, addLog: (log: string) => void) => {
        try {
            addLog('Deployment started...');
            const gcsUri = deployInfo.gcsStagingUri.endsWith('/') ? deployInfo.gcsStagingUri : `${deployInfo.gcsStagingUri}/`;
            const gcsMatch = gcsUri.match(/^gs:\/\/([a-zA-Z0-9._-]+)\/(.*)$/);
            if (!gcsMatch) {
                throw new Error('Invalid GCS URI format. Expected gs://bucket-name/path/');
            }
            
            addLog('Parsing environment variables from generated .env file...');
            const allEnvVars = generatedEnvCode
                .split('\n')
                .filter(line => line.trim() !== '' && !line.startsWith('#'))
                .map(line => {
                    const parts = line.split('=');
                    const key = parts.shift() || '';
                    const value = parts.join('=').trim().replace(/^"|"$/g, '');
                    return { name: key.trim(), value };
                });

            const reservedKeys = new Set(['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION']);
            const envVars = allEnvVars.filter(envVar => !reservedKeys.has(envVar.name));

            addLog(`  - Found ${allEnvVars.length} total variables.`);
            addLog(`  - Filtering out ${reservedKeys.size} reserved variables.`);
            addLog(`  - Injecting ${envVars.length} variables into deployment spec.`);

            addLog('Verifying staged files are present...');
            const requirementsUri = `${gcsUri}requirements.txt`;
            addLog(`  - Using requirements file: ${requirementsUri}`);
            addLog(`  - Using pickle file: ${deployInfo.pickleGcsUri}`);

            const deployConfig = { ...apiConfig, reasoningEngineLocation: deployInfo.location };

            // Construct the full specification for the agent
            const spec = {
                agentFramework: 'google-adk',
                packageSpec: {
                    pickleObjectGcsUri: deployInfo.pickleGcsUri,
                    requirementsGcsUri: requirementsUri,
                    pythonVersion: '3.10',
                },
                deploymentSpec: {
                    env: envVars,
                },
            };

            if (deployInfo.deployMode === 'new') {
                addLog(`Creating new Reasoning Engine: ${deployInfo.newEngineDisplayName}...`);
                const createPayload = {
                    displayName: deployInfo.newEngineDisplayName,
                    description: "An agent deployed via the Gemini Enterprise Manager.",
                    spec: spec,
                };
                let createOperation = await api.createReasoningEngine(createPayload, deployConfig);
                addLog(`Create operation started: ${createOperation.name}`);

                while (!createOperation.done) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    addLog(`Polling operation status...`);
                    createOperation = await api.getOperation(createOperation.name, deployConfig);
                }

                if (createOperation.error) {
                    throw new Error(`Deployment failed: ${createOperation.error.message}`);
                }
                const newEngine = createOperation.response;
                addLog(`New engine created successfully: ${newEngine?.name || 'Unknown Name'}`);

            } else { // 'existing' mode
                const engineToUpdate = deployInfo.engineName;
                addLog(`Updating Reasoning Engine '${engineToUpdate.split('/').pop()}' with new package...`);
                
                const updatePayload = { spec: spec };
                
                let updateOperation = await api.updateReasoningEngine(engineToUpdate, updatePayload, deployConfig);
                addLog(`Update operation started: ${updateOperation.name}`);

                while (!updateOperation.done) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    addLog(`Polling operation status...`);
                    updateOperation = await api.getOperation(updateOperation.name, deployConfig);
                }

                if (updateOperation.error) {
                    throw new Error(`Deployment failed: ${updateOperation.error.message}`);
                }
            }

            addLog('Deployment successful!');

        } catch (err: any) {
            addLog(`ERROR: ${err.message}`);
            throw err;
        }
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

    const handleLoadBuckets = useCallback(async () => {
        if (!projectNumber) return;
        setIsLoadingBuckets(true);
        setBucketLoadError(null);
        setBuckets([]);
        try {
            const res = await api.listBuckets(projectNumber);
            setBuckets(res.items || []);
        } catch (err: any) {
            setBucketLoadError(err.message || 'Failed to load buckets.');
        } finally {
            setIsLoadingBuckets(false);
        }
    }, [projectNumber]);
    
    const addUploadLog = (log: string) => {
        setUploadLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${log}`]);
    };

    const handlePickleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setPickleFile(e.target.files[0]);
        } else {
            setPickleFile(null);
        }
    };
    
    const handleRequirementsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setRequirementsFile(e.target.files[0]);
        } else {
            setRequirementsFile(null);
        }
    };

    const handleStageFiles = async () => {
        if (!gcsUploadBucket || !pickleFile || !requirementsFile) {
            alert('Please select a GCS bucket and both an agent.pkl and requirements.txt file.');
            return;
        }
        setIsUploading(true);
        setUploadLogs([]);
        addUploadLog(`Starting upload to gs://${gcsUploadBucket}/${gcsUploadPath}`);

        try {
            const path = gcsUploadPath.endsWith('/') || gcsUploadPath === '' ? gcsUploadPath : `${gcsUploadPath}/`;

            // Upload pickle file
            const pickleObjectName = `${path}${pickleFile.name}`;
            addUploadLog(`Uploading ${pickleFile.name} to ${pickleObjectName}...`);
            await api.uploadFileToGcs(gcsUploadBucket, pickleObjectName, pickleFile, projectNumber);
            addUploadLog(`  - ${pickleFile.name} uploaded successfully.`);

            // Upload requirements.txt
            const reqsObjectName = `${path}${requirementsFile.name}`;
            addUploadLog(`Uploading ${requirementsFile.name} to ${reqsObjectName}...`);
            await api.uploadFileToGcs(gcsUploadBucket, reqsObjectName, requirementsFile, projectNumber);
            addUploadLog(`  - ${requirementsFile.name} uploaded successfully.`);

            addUploadLog('Staging files uploaded successfully!');

        } catch (err: any) {
            addUploadLog(`ERROR: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };
    
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {isDeployModalOpen && (
                <DeployModal
                    isOpen={isDeployModalOpen}
                    onClose={() => setIsDeployModalOpen(false)}
                    onDeploy={handleDeploy}
                    config={apiConfig}
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
                {agentConfig.tools.length > 0 &&
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
                    <h2 className="text-xl font-semibold text-white">Export & Deploy Workflow</h2>
                    
                    {/* Step 1: Download */}
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-1">Step 1: Download & Prepare Locally</h3>
                        <p className="text-xs text-gray-400 mb-2">Download a .zip file with your agent code. Follow the instructions in the included <code className="bg-gray-800 p-1 rounded text-xs">README.md</code> to create the required <code className="bg-gray-800 p-1 rounded text-xs">agent.pkl</code> file locally.</p>
                        <button onClick={handleDownloadCode} className="w-full px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-md hover:bg-gray-500">
                            Download Agent Package (.zip)
                        </button>
                    </div>

                    <div className="border-t border-gray-700"></div>

                    {/* Step 2: Upload Agent Package */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-white">Step 2: Upload Agent Package to GCS</h3>
                        <p className="text-xs text-gray-400 -mt-2">Upload your prepared agent files to a GCS bucket. This makes them available for deployment.</p>
                        <div>
                            <label className="block text-sm font-medium text-gray-400">GCS Bucket</label>
                            <div className="flex items-center gap-2 mt-1">
                                <select 
                                    value={gcsUploadBucket} 
                                    onChange={(e) => setGcsUploadBucket(e.target.value)} 
                                    className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" 
                                    disabled={isUploading || isLoadingBuckets}
                                >
                                    <option value="">{isLoadingBuckets ? 'Loading...' : '-- Select a Bucket --'}</option>
                                    {buckets.map(bucket => <option key={bucket.id} value={bucket.name}>{bucket.name}</option>)}
                                </select>
                                <button onClick={handleLoadBuckets} disabled={isLoadingBuckets || isUploading} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 h-[38px] shrink-0">
                                    {isLoadingBuckets ? '...' : 'Load'}
                                </button>
                            </div>
                            {bucketLoadError && <p className="text-xs text-red-400 mt-1">{bucketLoadError}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400">GCS Path (Optional)</label>
                            <input 
                                type="text" 
                                value={gcsUploadPath} 
                                onChange={(e) => setGcsUploadPath(e.target.value)} 
                                placeholder="e.g., my-agent-files/" 
                                className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2" 
                                disabled={isUploading} 
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="pickle-file-input" className="block text-sm font-medium text-gray-400">Agent Pickle File <span className="text-red-400">*</span></label>
                                <p className="text-xs text-gray-500 mb-1">Select `agent.pkl`.</p>
                                <input 
                                    id="pickle-file-input"
                                    type="file" 
                                    accept=".pkl"
                                    onChange={handlePickleFileChange}
                                    className="mt-1 block w-full text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
                                    disabled={isUploading} 
                                />
                            </div>
                             <div>
                                <label htmlFor="requirements-file-input" className="block text-sm font-medium text-gray-400">Requirements File <span className="text-red-400">*</span></label>
                                <p className="text-xs text-gray-500 mb-1">Select `requirements.txt`.</p>
                                <input 
                                    id="requirements-file-input"
                                    type="file" 
                                    accept=".txt"
                                    onChange={handleRequirementsFileChange}
                                    className="mt-1 block w-full text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600"
                                    disabled={isUploading} 
                                />
                            </div>
                        </div>
                        <button onClick={handleStageFiles} disabled={isUploading || !gcsUploadBucket || !pickleFile || !requirementsFile} className="w-full px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700 disabled:bg-gray-500 flex items-center justify-center">
                            {isUploading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>}
                            {isUploading ? 'Uploading...' : 'Upload Agent Package'}
                        </button>
                        {uploadLogs.length > 0 && (
                            <div className="mt-2">
                                <h4 className="text-sm font-semibold text-gray-300">Upload Log</h4>
                                <pre className="bg-gray-800 text-xs text-gray-300 p-2 mt-1 rounded-md h-24 overflow-y-auto font-mono">
                                    {uploadLogs.join('\n')}
                                </pre>
                            </div>
                        )}
                    </div>
                    
                    <div className="border-t border-gray-700"></div>

                    {/* Step 3: Deploy */}
                    <div>
                        <h3 className="text-lg font-semibold text-white">Step 3: Deploy to Reasoning Engine</h3>
                        <p className="text-xs text-gray-400 mb-2">Open the deployment wizard to use your staged files to update an existing engine or create a new one.</p>
                        <button onClick={() => setIsDeployModalOpen(true)} className="w-full px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700">
                            Deploy to Reasoning Engine
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentBuilderPage;
