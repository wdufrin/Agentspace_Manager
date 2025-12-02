


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Agent, Assistant, Config } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import AgentDetails from '../components/agents/AgentDetails';
import AgentDeploymentModal from '../components/agent-catalog/AgentDeploymentModal';
import CloudBuildProgress from '../components/agent-builder/CloudBuildProgress';

declare var JSZip: any;

interface AgentCatalogPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
}

interface GitAgentDir {
    name: string;
    path: string;
    html_url: string;
    url: string; // api url
    type: 'dir' | 'file';
    metadata?: Record<string, string>;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('agentCatalogConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.projectNumber;
      return parsed;
    }
  } catch (e) {
    console.error("Failed to parse config from sessionStorage", e);
  }
  return {
    appId: '',
    appLocation: 'global',
  };
};

const extractMetadataFromReadme = (readme: string): Record<string, string> => {
    const metadata: Record<string, string> = {};
    const lines = readme.split('\n');
    let insideTable = false;

    for (const line of lines) {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();
        
        // Detect table header: | Feature | Description | OR | Attribute | Details |
        if (!insideTable) {
            if ((lower.includes('| feature') && lower.includes('| description')) || 
                (lower.includes('| attribute') && lower.includes('| details'))) {
                insideTable = true;
                continue;
            }
        }

        if (insideTable) {
            if (!trimmed.startsWith('|')) {
                // If text starts without pipe, table likely ended
                if (trimmed !== '') break; 
                continue;
            }
            if (trimmed.includes('---')) {
                continue; // Skip separator
            }
            
            // Parse row: | **Key** | Value |
            const parts = trimmed.split('|');
            // Filter out empty strings from split (usually first/last if pipe-bordered)
            const cleanParts = parts.filter(p => p.trim() !== '');
            
            if (cleanParts.length >= 2) {
                // Remove Markdown bold syntax (**) and trim
                const key = cleanParts[0].replace(/\*\*/g, '').trim(); 
                const value = cleanParts[1].trim();
                if (key && value) {
                    metadata[key] = value;
                }
            }
        }
    }
    return metadata;
};

const AgentCard: React.FC<{ agent: Agent; onClick: () => void }> = ({ agent, onClick }) => {
    const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';
    const statusText = agent.state ? agent.state : 'PRIVATE';

    return (
        <div 
            onClick={onClick}
            className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-blue-500 hover:bg-gray-750 transition-all cursor-pointer shadow-lg flex flex-col h-full group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-gray-700 rounded-full group-hover:bg-gray-600 transition-colors">
                    {agent.icon?.uri ? (
                        <img src={agent.icon.uri} alt="icon" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )}
                </div>
                <span className={`px-2 py-1 text-[10px] font-bold rounded-full text-white ${statusColorClass}`}>
                    {statusText}
                </span>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-2 line-clamp-1" title={agent.displayName}>{agent.displayName}</h3>
            <p className="text-sm text-gray-400 mb-4 line-clamp-3 flex-grow">{agent.description || 'No description provided.'}</p>
            
            <div className="mt-auto pt-4 border-t border-gray-700 flex justify-between items-center text-xs text-gray-500">
                <span className="font-mono truncate max-w-[120px]" title={agent.name.split('/').pop()}>{agent.name.split('/').pop()}</span>
                <span className="bg-gray-700 px-2 py-1 rounded text-gray-300">{agent.agentType || 'Agent'}</span>
            </div>
        </div>
    );
};

const TagBubble: React.FC<{ label: string; value: string; colorClass?: string }> = ({ label, value, colorClass = 'bg-gray-700 text-gray-300' }) => (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border border-opacity-30 ${colorClass}`} title={`${label}: ${value}`}>
        {value}
    </span>
);

const GitAgentCard: React.FC<{ 
    agent: GitAgentDir; 
    onSelect: (agent: GitAgentDir) => void;
    isLoading: boolean;
}> = ({ agent, onSelect, isLoading }) => {
    const meta = agent.metadata || {};
    
    // Prioritize specific fields for display
    let vertical = meta['Vertical'];
    // If vertical is "All", treat it as blank so it doesn't show a bubble
    if (vertical && vertical.toLowerCase() === 'all') {
        vertical = '';
    }

    const complexity = meta['Complexity'];
    const agentType = meta['Agent Type'];
    const interactionType = meta['Interaction Type'];
    
    return (
        <div 
            onClick={() => onSelect(agent)}
            className="bg-gray-800 rounded-lg p-5 border border-gray-700 hover:border-teal-500 hover:bg-gray-750 transition-all cursor-pointer shadow-lg flex flex-col h-full group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-gray-700 rounded-full group-hover:bg-gray-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-400" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.604 9.604 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                </div>
                {/* Metadata Tags Row */}
                <div className="flex flex-wrap gap-1 justify-end max-w-[65%]">
                    {vertical && <TagBubble label="Vertical" value={vertical} colorClass="bg-purple-900 text-purple-200 border-purple-700" />}
                    {complexity && <TagBubble label="Complexity" value={complexity} colorClass="bg-blue-900 text-blue-200 border-blue-700" />}
                    {agentType && <TagBubble label="Type" value={agentType} colorClass="bg-gray-700 text-gray-300 border-gray-600" />}
                    {!vertical && !complexity && !agentType && (
                        <span className="px-2 py-1 text-[10px] font-bold rounded-full bg-teal-900 text-teal-200 border border-teal-700">
                            SAMPLE
                        </span>
                    )}
                </div>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-2 break-all">{agent.name}</h3>
            <p className="text-sm text-gray-400 mb-4 flex-grow line-clamp-3">
                {agent.metadata?.['Description'] || "Python agent sample from GitHub. Click to view architecture and deploy."}
            </p>
            
            <div className="mt-auto pt-4 border-t border-gray-700 flex justify-between items-center gap-2">
                <span className="text-xs text-blue-400 flex items-center">
                    {isLoading ? (
                        <>
                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400 mr-2"></div>
                            Loading Files...
                        </>
                    ) : 'Click to Inspect & Deploy'}
                </span>
                {interactionType && (
                    <span className="text-[10px] text-gray-500 font-mono">
                        {interactionType}
                    </span>
                )}
            </div>
        </div>
    );
};

const FilterDropdown: React.FC<{ 
    label: string; 
    options: string[]; 
    value: string; 
    onChange: (val: string) => void;
}> = ({ label, options, value, onChange }) => (
    <div className="relative flex flex-col min-w-[140px]">
        <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 ml-1">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-gray-700 text-white text-xs rounded-md px-2 py-2 border border-gray-600 focus:ring-teal-500 focus:border-teal-500"
        >
            <option value="">All</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

const AgentCatalogPage: React.FC<AgentCatalogPageProps> = ({ projectNumber, setProjectNumber, accessToken }) => {
  const [activeTab, setActiveTab] = useState<'project' | 'git'>('git');
  
  // Project Agents State
  const [config, setConfig] = useState(() => ({
    ...getInitialConfig(),
    collectionId: 'default_collection',
    assistantId: 'default_assistant',
  }));
  const [apps, setApps] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Git Catalog State
  const [gitRepoUrl, setGitRepoUrl] = useState('https://github.com/google/adk-samples/tree/main/python/agents');
  const [gitAgents, setGitAgents] = useState<GitAgentDir[]>([]);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [loadingAgentFiles, setLoadingAgentFiles] = useState<string | null>(null);
  
  // Filter States
  const [filterVertical, setFilterVertical] = useState('');
  const [filterComplexity, setFilterComplexity] = useState('');
  const [filterAgentType, setFilterAgentType] = useState('');
  const [filterInteractionType, setFilterInteractionType] = useState('');
  
  // Deploy Modal State
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [selectedGitAgentName, setSelectedGitAgentName] = useState<string>('');
  const [selectedGitFiles, setSelectedGitFiles] = useState<{name: string, content: string}[]>([]);
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);

  // Persist config
  useEffect(() => {
    const { appId, appLocation } = config;
    sessionStorage.setItem('agentCatalogConfig', JSON.stringify({ appId, appLocation }));
  }, [config]);

  const apiConfig = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
        const newConfig = { ...prev, [name]: value };
        if (name === 'appLocation') {
            newConfig.appId = '';
            setApps([]);
        }
        return newConfig;
    });
  };

  // --- Project Agents Logic ---
  useEffect(() => {
    if (activeTab !== 'project') return;
    if (!apiConfig.projectId || !apiConfig.appLocation) {
        setApps([]);
        return;
    }
    const fetchApps = async () => {
        setIsLoadingApps(true);
        setApps([]);
        try {
            const response = await api.listResources('engines', apiConfig);
            const fetchedApps = response.engines || [];
            setApps(fetchedApps);
            if (fetchedApps.length === 1) {
                setConfig(prev => ({ ...prev, appId: fetchedApps[0].name.split('/').pop()! }));
            }
        } catch (err) {
            console.error("Failed to fetch engines:", err);
        } finally {
            setIsLoadingApps(false);
        }
    };
    fetchApps();
  }, [apiConfig.projectId, apiConfig.appLocation, apiConfig.collectionId, activeTab]);

  const fetchAgents = useCallback(async () => {
    if (!apiConfig.projectId || !apiConfig.appId) {
      setAgents([]);
      if (apiConfig.projectId && !apiConfig.appId) {
        setError("Please select a Gemini Enterprise Engine to browse agents.");
      }
      return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
        const assistantsResponse = await api.listResources('assistants', apiConfig);
        const assistants: Assistant[] = assistantsResponse.assistants || [];
        
        const agentPromises = assistants.map(assistant => {
            const assistantId = assistant.name.split('/').pop()!;
            const agentListConfig = { ...apiConfig, assistantId };
            return api.listResources('agents', agentListConfig);
        });

        const agentResults = await Promise.allSettled(agentPromises);
        const allAgents: Agent[] = [];

        agentResults.forEach((result) => {
            if (result.status === 'fulfilled') {
                allAgents.push(...(result.value.agents || []));
            }
        });
        
        // Enrich agents
        if (allAgents.length > 0) {
          const enrichedAgents = await Promise.all(allAgents.map(async (agent) => {
             try {
                 const view = await api.getAgentView(agent.name, apiConfig);
                 if (view && view.agentView) {
                     return { ...agent, agentType: view.agentView.agentType };
                 }
             } catch (e) { /* ignore */ }
             return agent;
          }));
          setAgents(enrichedAgents);
        } else {
          setAgents([]);
        }

    } catch (err: any) {
      setError(err.message || 'Failed to fetch agents.');
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig]);

  useEffect(() => {
    if (activeTab === 'project' && config.appId) {
      fetchAgents();
    } else if (activeTab === 'project') {
        setAgents([]);
    }
  }, [fetchAgents, config.appId, activeTab]);

  const filteredAgents = useMemo(() => {
      if (!searchTerm) return agents;
      const lowerTerm = searchTerm.toLowerCase();
      return agents.filter(a => 
          a.displayName.toLowerCase().includes(lowerTerm) || 
          (a.description && a.description.toLowerCase().includes(lowerTerm))
      );
  }, [agents, searchTerm]);

  // --- Git Catalog Logic ---
  const fetchGitAgents = useCallback(async () => {
      if (!gitRepoUrl) return;
      setIsLoadingGit(true);
      setGitError(null);
      setGitAgents([]);

      try {
          // Parse URL: https://github.com/OWNER/REPO/tree/BRANCH/PATH
          const url = new URL(gitRepoUrl);
          const pathParts = url.pathname.split('/').filter(Boolean); // [owner, repo, tree, branch, ...path]
          
          if (pathParts.length < 4 || pathParts[2] !== 'tree') {
              throw new Error("Invalid GitHub Tree URL. Format: https://github.com/owner/repo/tree/branch/path");
          }

          const owner = pathParts[0];
          const repo = pathParts[1];
          const branch = pathParts[3];
          const path = pathParts.slice(4).join('/');

          // 1. Fetch list of directories
          const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
          const response = await fetch(apiUrl);
          if (!response.ok) {
              throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          if (Array.isArray(data)) {
              const dirs: GitAgentDir[] = data.filter((item: any) => item.type === 'dir');
              
              // 2. Fetch README for each directory to extract metadata
              // Using raw.githubusercontent.com to avoid API rate limits for content
              const enrichedDirs = await Promise.all(dirs.map(async (dir) => {
                  try {
                      // Construct raw URL: https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${dir.name}/README.md
                      const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${dir.name}/README.md`;
                      const readmeRes = await fetch(readmeUrl);
                      if (readmeRes.ok) {
                          const text = await readmeRes.text();
                          const metadata = extractMetadataFromReadme(text);
                          return { ...dir, metadata };
                      }
                  } catch (e) {
                      console.warn(`Failed to fetch README for ${dir.name}`, e);
                  }
                  return dir;
              }));

              setGitAgents(enrichedDirs);
              if (enrichedDirs.length === 0) {
                  setGitError("No agent directories found at this location.");
              }
          } else {
              setGitError("Path does not point to a directory.");
          }

      } catch (err: any) {
          setGitError(err.message || "Failed to fetch from GitHub.");
      } finally {
          setIsLoadingGit(false);
      }
  }, [gitRepoUrl]);

  // Initial fetch for Git tab
  useEffect(() => {
      if (activeTab === 'git' && gitAgents.length === 0) {
          fetchGitAgents();
      }
  }, [activeTab, fetchGitAgents, gitAgents.length]);

  const fetchRepoContents = async (url: string, prefix: string = '', depth: number = 0): Promise<{name: string, content: string}[]> => {
      if (depth > 5) return [];

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to list contents of ${prefix || 'root'}`);
      const items = await response.json();
      
      if (!Array.isArray(items)) throw new Error("Invalid GitHub API response");

      let results: {name: string, content: string}[] = [];

      for (const item of items) {
          if (item.type === 'file' && item.download_url) {
              setLoadingAgentFiles(`Fetching ${prefix}${item.name}`);
              const fileRes = await fetch(item.download_url);
              if (fileRes.ok) {
                  const content = await fileRes.text();
                  results.push({ name: prefix + item.name, content });
              } else {
                  console.warn(`Failed to fetch file content for ${item.name}: ${fileRes.status}`);
              }
          } else if (item.type === 'dir') {
              const subResults = await fetchRepoContents(item.url, prefix + item.name + '/', depth + 1);
              results = [...results, ...subResults];
          }
      }
      return results;
  };

  const handleSelectGitAgent = async (agent: GitAgentDir) => {
      setLoadingAgentFiles(agent.name);
      try {
          const loadedFiles = await fetchRepoContents(agent.url);
          
          if (loadedFiles.length === 0) {
              throw new Error("No readable files found in this agent directory or its subdirectories.");
          }

          setSelectedGitFiles(loadedFiles);
          setSelectedGitAgentName(agent.name);
          setIsDeployModalOpen(true);

      } catch (err: any) {
          alert(`Failed to load agent files: ${err.message}`);
          console.error("Agent load error details:", err);
      } finally {
          setLoadingAgentFiles(null);
      }
  };

  // Derive unique filter options
  const filterOptions = useMemo(() => {
      const verticals = new Set<string>();
      const complexities = new Set<string>();
      const types = new Set<string>();
      const interactionTypes = new Set<string>();

      gitAgents.forEach(agent => {
          if (agent.metadata?.['Vertical']) verticals.add(agent.metadata['Vertical']);
          if (agent.metadata?.['Complexity']) complexities.add(agent.metadata['Complexity']);
          if (agent.metadata?.['Agent Type']) types.add(agent.metadata['Agent Type']);
          if (agent.metadata?.['Interaction Type']) interactionTypes.add(agent.metadata['Interaction Type']);
      });

      return {
          verticals: Array.from(verticals).sort(),
          complexities: Array.from(complexities).sort(),
          types: Array.from(types).sort(),
          interactionTypes: Array.from(interactionTypes).sort(),
      };
  }, [gitAgents]);

  const filteredGitAgents = useMemo(() => {
      let filtered = gitAgents;

      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          filtered = filtered.filter(a => a.name.toLowerCase().includes(lowerTerm));
      }
      if (filterVertical) {
          filtered = filtered.filter(a => a.metadata?.['Vertical'] === filterVertical);
      }
      if (filterComplexity) {
          filtered = filtered.filter(a => a.metadata?.['Complexity'] === filterComplexity);
      }
      if (filterAgentType) {
          filtered = filtered.filter(a => a.metadata?.['Agent Type'] === filterAgentType);
      }
      if (filterInteractionType) {
          filtered = filtered.filter(a => a.metadata?.['Interaction Type'] === filterInteractionType);
      }

      return filtered;
  }, [gitAgents, searchTerm, filterVertical, filterComplexity, filterAgentType, filterInteractionType]);


  return (
    <div className="space-y-6 h-full flex flex-col relative">
        {/* Deployment Progress Bar */}
        {activeBuildId && projectNumber && (
            <CloudBuildProgress 
                projectId={projectNumber} 
                buildId={activeBuildId} 
                onClose={() => setActiveBuildId(null)} 
            />
        )}

        {/* Deploy Modal */}
        {isDeployModalOpen && (
            <AgentDeploymentModal
                isOpen={isDeployModalOpen}
                onClose={() => setIsDeployModalOpen(false)}
                agentName={selectedGitAgentName}
                files={selectedGitFiles}
                projectNumber={projectNumber}
                onBuildTriggered={(buildId) => setActiveBuildId(buildId)}
            />
        )}

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg shrink-0">
            <button
                onClick={() => setActiveTab('git')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'git'
                        ? 'bg-gray-700 text-white shadow'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
            >
                Sample Library (GitHub)
            </button>
            <button
                onClick={() => setActiveTab('project')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'project'
                        ? 'bg-gray-700 text-white shadow'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
            >
                Project Agents
            </button>
        </div>

        {/* Detail Modal Overlay (Project Agents only) */}
        {selectedAgent && (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
                <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 relative">
                    <button 
                        onClick={() => setSelectedAgent(null)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-full p-2 z-10"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="p-6">
                        <AgentDetails 
                            agent={selectedAgent}
                            config={apiConfig}
                            onBack={() => setSelectedAgent(null)}
                            onEdit={() => {/* Edit not supported in Catalog view directly */}}
                            onDeleteSuccess={() => { setSelectedAgent(null); fetchAgents(); }}
                            onToggleStatus={async () => { await fetchAgents(); }}
                            togglingAgentId={null}
                            error={null}
                        />
                    </div>
                </div>
            </div>
        )}

      <div className="bg-gray-800 p-4 rounded-lg shadow-md shrink-0">
        <h2 className="text-lg font-semibold text-white mb-3">
            {activeTab === 'project' ? 'Project Configuration' : 'Source Configuration'}
        </h2>
        
        {activeTab === 'project' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                    <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                </div>
                <div>
                    <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                    <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                    <option value="global">global</option>
                    <option value="us">us</option>
                    <option value="eu">eu</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Gemini Enterprise ID</label>
                    <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
                    <option value="">{isLoadingApps ? 'Loading...' : '-- Select Engine --'}</option>
                    {apps.map(a => <option key={a.name} value={a.name.split('/').pop()}>{a.displayName}</option>)}
                    </select>
                </div>
                <div className="w-full">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            name="search"
                            id="search"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md leading-5 bg-gray-700 text-gray-300 placeholder-gray-400 focus:outline-none focus:bg-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm h-[42px]"
                            placeholder="Search agents..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>
        ) : (
            <div className="space-y-4">
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label htmlFor="gitRepoUrl" className="block text-sm font-medium text-gray-400 mb-1">GitHub Folder URL</label>
                        <input 
                            type="text" 
                            id="gitRepoUrl"
                            value={gitRepoUrl} 
                            onChange={(e) => setGitRepoUrl(e.target.value)} 
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-teal-500 focus:border-teal-500"
                            placeholder="https://github.com/owner/repo/tree/branch/path/to/agents"
                        />
                    </div>
                    <button 
                        onClick={fetchGitAgents} 
                        disabled={isLoadingGit}
                        className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700 disabled:bg-gray-600 h-[42px] min-w-[100px]"
                    >
                        {isLoadingGit ? 'Fetching...' : 'Fetch'}
                    </button>
                </div>
                
                {/* Filters */}
                {gitAgents.length > 0 && (
                    <div className="flex gap-4 flex-wrap bg-gray-700/30 p-2 rounded-lg border border-gray-700">
                        <FilterDropdown label="Vertical" options={filterOptions.verticals} value={filterVertical} onChange={setFilterVertical} />
                        <FilterDropdown label="Complexity" options={filterOptions.complexities} value={filterComplexity} onChange={setFilterComplexity} />
                        <FilterDropdown label="Agent Type" options={filterOptions.types} value={filterAgentType} onChange={setFilterAgentType} />
                        <FilterDropdown label="Interaction" options={filterOptions.interactionTypes} value={filterInteractionType} onChange={setFilterInteractionType} />
                        
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 ml-1">Search</label>
                            <input
                                type="text"
                                className="w-full bg-gray-700 text-white text-xs rounded-md px-3 py-2 border border-gray-600 focus:ring-teal-500 focus:border-teal-500"
                                placeholder="Filter samples..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        {(filterVertical || filterComplexity || filterAgentType || filterInteractionType || searchTerm) && (
                            <button 
                                onClick={() => { setFilterVertical(''); setFilterComplexity(''); setFilterAgentType(''); setFilterInteractionType(''); setSearchTerm(''); }}
                                className="self-end px-3 py-2 text-xs text-red-300 hover:text-white"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Project Agents View */}
        {activeTab === 'project' && (
            <>
                {isLoading && agents.length === 0 ? (
                    <Spinner />
                ) : error ? (
                    <div className="text-center text-red-400 p-8 bg-gray-800 rounded-lg">{error}</div>
                ) : filteredAgents.length === 0 ? (
                    <div className="text-center text-gray-500 p-12 bg-gray-800 rounded-lg border border-gray-700 border-dashed">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-300">No Agents Found</h3>
                        <p className="mt-1">Try selecting a different engine or adjusting your search.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                        {filteredAgents.map(agent => (
                            <AgentCard 
                                key={agent.name} 
                                agent={agent} 
                                onClick={() => setSelectedAgent(agent)}
                            />
                        ))}
                    </div>
                )}
            </>
        )}

        {/* Git Catalog View */}
        {activeTab === 'git' && (
            <>
                {isLoadingGit ? (
                    <Spinner />
                ) : gitError ? (
                    <div className="text-center text-red-400 p-8 bg-gray-800 rounded-lg">{gitError}</div>
                ) : filteredGitAgents.length === 0 ? (
                    <div className="text-center text-gray-500 p-12 bg-gray-800 rounded-lg border border-gray-700 border-dashed">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.604 9.604 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-300">No Samples Found</h3>
                        <p className="mt-1">Check the URL or try a different filter.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                        {filteredGitAgents.map(agent => (
                            <GitAgentCard 
                                key={agent.name} 
                                agent={agent} 
                                onSelect={handleSelectGitAgent}
                                isLoading={loadingAgentFiles === agent.name || (typeof loadingAgentFiles === 'string' && loadingAgentFiles.startsWith('Fetching ' + agent.name))}
                            />
                        ))}
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default AgentCatalogPage;