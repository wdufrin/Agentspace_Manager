import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import AgentDeploymentModal from '../components/agent-catalog/AgentDeploymentModal';

declare var JSZip: any;

interface AgentCatalogPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  onBuildTriggered: (buildId: string) => void;
}

interface CatalogAgent {
    name: string;
    // For GitHub:
    html_url?: string;
    url?: string; // api url
    // For Local:
    dirHandle?: any; // FileSystemDirectoryHandle
    // Common:
    source: 'github' | 'local';
    metadata?: Record<string, string>;
    readmeContent?: string;
}

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

const TagBubble: React.FC<{ label: string; value: string; colorClass?: string }> = ({ label, value, colorClass = 'bg-gray-700 text-gray-300' }) => (
    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border border-opacity-30 ${colorClass}`} title={`${label}: ${value}`}>
        {value}
    </span>
);

const AgentCard: React.FC<{
    agent: CatalogAgent;
    onSelect: (agent: CatalogAgent) => void;
}> = ({ agent, onSelect }) => {
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
                <div className="p-2 bg-gray-700 rounded-full group-hover:bg-gray-600 transition-colors relative">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-400" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.604 9.604 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    {agent.source === 'local' && (
                        <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-0.5 border border-gray-900" title="Local Agent">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                        </div>
                    )}
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
                {agent.metadata?.['Description'] || (agent.source === 'local' ? "Local agent loaded from filesystem." : "Python agent sample from GitHub. Click to view architecture and deploy.")}
            </p>
            
            <div className="mt-auto pt-4 border-t border-gray-700 flex justify-between items-center gap-2">
                <span className="text-xs text-blue-400 flex items-center">
                    Click to View
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

const AgentCatalogPage: React.FC<AgentCatalogPageProps> = ({ projectNumber, setProjectNumber, onBuildTriggered }) => {
    // Catalog State
  const [gitRepoUrl, setGitRepoUrl] = useState('https://github.com/google/adk-samples/tree/main/python/agents');
    const [agents, setAgents] = useState<CatalogAgent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Loading state for file fetching
    const [isFetchingFiles, setIsFetchingFiles] = useState<boolean>(false);
    const [fetchStatus, setFetchStatus] = useState<string>('');

  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter States
  const [filterVertical, setFilterVertical] = useState('');
  const [filterComplexity, setFilterComplexity] = useState('');
  const [filterAgentType, setFilterAgentType] = useState('');
  const [filterInteractionType, setFilterInteractionType] = useState('');
  
  // Deploy Modal State
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState<CatalogAgent | null>(null);
    const [selectedAgentFiles, setSelectedAgentFiles] = useState<{ name: string, content: string }[]>([]);

  const handleBuildTriggered = (buildId: string) => {
      onBuildTriggered(buildId); // Notify parent
      setIsDeployModalOpen(false); // Close modal
  };

    // --- Local Folder Logic ---
    const handleLoadLocalAgents = async () => {
        setIsLoading(true);
        setError(null);
        setAgents([]);

        try {
            // @ts-ignore - File System Access API
            const dirHandle = await window.showDirectoryPicker();

            const localAgents: CatalogAgent[] = [];

            // Iterate through valid subdirectories
            // @ts-ignore
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'directory') {
                    // Check if this directory looks like an agent or contains a README
                    // We'll treat every subdirectory as a potential agent
                    let metadata: Record<string, string> = {};
                    let readmeContent = '';

                    try {
                        const readmeHandle = await entry.getFileHandle('README.md');
                        const file = await readmeHandle.getFile();
                        readmeContent = await file.text();
                        metadata = extractMetadataFromReadme(readmeContent);
                    } catch (e) {
                        // No README or error reading it, ignore metadata but still list agent
                    }

                    localAgents.push({
                        name: entry.name,
                        source: 'local',
                        dirHandle: entry,
                        metadata,
                        readmeContent
                    });
                }
            }

            if (localAgents.length === 0) {
                setError("No folders found in the selected directory.");
            } else {
                setAgents(localAgents);
            }

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(`Failed to load local agents: ${err.message} `);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const getLocalFilesRecursive = async (dirHandle: any, prefix: string = ''): Promise<{ name: string, content: string }[]> => {
        let results: { name: string, content: string }[] = [];
        // @ts-ignore
        for await (const entry of dirHandle.values()) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
                // Skip hidden files or large binaries if needed
                if (!entry.name.startsWith('.')) {
                    try {
                        setFetchStatus(`Reading ${path}...`);
                        const file = await entry.getFile();
                        // Basic text check or try/catch
                        const text = await file.text();
                        results.push({ name: path, content: text });
                    } catch (e) {
                        console.warn(`Skipping binary or unreadable file: ${path}`);
                    }
                }
            } else if (entry.kind === 'directory') {
                if (!entry.name.startsWith('.') && entry.name !== '__pycache__' && entry.name !== 'venv' && entry.name !== 'node_modules') {
                    const subResults = await getLocalFilesRecursive(entry, path);
                    results = [...results, ...subResults];
                }
            }
        }
        return results;
    };

    // --- GitHub Logic ---
  const fetchGitAgents = useCallback(async () => {
      if (!gitRepoUrl) return;
      setIsLoading(true);
      setError(null);
      setAgents([]);

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
              const dirs: CatalogAgent[] = data.filter((item: any) => item.type === 'dir').map((item: any) => ({
                  name: item.name,
                  source: 'github',
                  html_url: item.html_url,
                  url: item.url,
                  metadata: {}
              }));
              
              // 2. Fetch README for each directory to extract metadata
              // Using raw.githubusercontent.com to avoid API rate limits for content
              const enrichedDirs = await Promise.all(dirs.map(async (agent) => {
                  try {
                      // Construct raw URL: https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${dir.name}/README.md
                      const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/${agent.name}/README.md`;
                      const readmeRes = await fetch(readmeUrl);
                      if (readmeRes.ok) {
                          const text = await readmeRes.text();
                          const metadata = extractMetadataFromReadme(text);
                          return { ...agent, metadata, readmeContent: text };
                      }
                  } catch (e) {
                      console.warn(`Failed to fetch README for ${agent.name}`, e);
                  }
                  return agent;
              }));

              setAgents(enrichedDirs);
              if (enrichedDirs.length === 0) {
                  setError("No agent directories found at this location.");
              }
          } else {
              setError("Path does not point to a directory.");
          }

      } catch (err: any) {
          setError(err.message || "Failed to fetch from GitHub.");
      } finally {
          setIsLoading(false);
      }
  }, [gitRepoUrl]);

    // Initial fetch for GitHub default
  useEffect(() => {
      // Only auto-fetch if we have a URL and empty list, and NOT if we intentionally cleared it or set up local
      // For now, let's just trigger it once on mount if meaningful
      if (agents.length === 0 && gitRepoUrl.includes('github.com')) {
          fetchGitAgents();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once

  const fetchRepoContents = async (url: string, prefix: string = '', depth: number = 0): Promise<{name: string, content: string}[]> => {
      if (depth > 5) return [];

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to list contents of ${prefix || 'root'}`);
      const items = await response.json();
      
      if (!Array.isArray(items)) throw new Error("Invalid GitHub API response");

      let results: {name: string, content: string}[] = [];

      for (const item of items) {
          if (item.type === 'file' && item.download_url) {
              setFetchStatus(`Fetching ${prefix}${item.name}`);
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

    const loadFilesForAgent = async (agent: CatalogAgent) => {
        setIsFetchingFiles(true);
        setFetchStatus('Starting download...');

      try {
          let loadedFiles: { name: string, content: string }[] = [];
          if (agent.source === 'local' && agent.dirHandle) {
              loadedFiles = await getLocalFilesRecursive(agent.dirHandle);
          } else if (agent.source === 'github' && agent.url) {
              loadedFiles = await fetchRepoContents(agent.url);
          }
          
          if (loadedFiles.length === 0) {
              alert("No readable files found in this agent directory.");
          } else {
              setSelectedAgentFiles(loadedFiles);
          }
        } catch (err: any) {
            alert(`Failed to load files: ${err.message}`);
            console.error("Agent file load error details:", err);
        } finally {
            setIsFetchingFiles(false);
            setFetchStatus('');
        }
    };

    const handleSelectAgent = (agent: CatalogAgent) => {
        // Just open modal with agent info
        setSelectedAgent(agent);
        setSelectedAgentFiles([]); // Start empty
        setIsDeployModalOpen(true);

        // Auto-load for all agents
        loadFilesForAgent(agent);
    };

    const handleLoadFiles = async () => {
        if (!selectedAgent) return;
        await loadFilesForAgent(selectedAgent);
    };

  // Derive unique filter options
  const filterOptions = useMemo(() => {
      const verticals = new Set<string>();
      const complexities = new Set<string>();
      const types = new Set<string>();
      const interactionTypes = new Set<string>();

      agents.forEach(agent => {
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
  }, [agents]);

    const filteredAgents = useMemo(() => {
        let filtered = agents;

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
    }, [agents, searchTerm, filterVertical, filterComplexity, filterAgentType, filterInteractionType]);


  return (
    <div className="space-y-6 h-full flex flex-col relative">
        {/* Deploy Modal */}
        {isDeployModalOpen && (
            <AgentDeploymentModal
                isOpen={isDeployModalOpen}
                onClose={() => setIsDeployModalOpen(false)}
                  agentName={selectedAgent?.name || ''}
                  files={selectedAgentFiles}
                projectNumber={projectNumber}
                onBuildTriggered={handleBuildTriggered}
                  readmeContent={selectedAgent?.readmeContent}
                  onLoadFiles={handleLoadFiles}
                  isFetchingFiles={isFetchingFiles}
            />
        )}

      <div className="bg-gray-800 p-4 rounded-lg shadow-md shrink-0">
        <h2 className="text-lg font-semibold text-white mb-3">
            Catalog Configuration
        </h2>
        
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                    <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                </div>
                <div>
                          <label htmlFor="gitRepoUrl" className="block text-sm font-medium text-gray-400 mb-1">Source (GitHub or Local)</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            id="gitRepoUrl"
                            value={gitRepoUrl} 
                            onChange={(e) => setGitRepoUrl(e.target.value)} 
                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-teal-500 focus:border-teal-500"
                            placeholder="https://github.com/owner/repo/tree/branch/path/to/agents"
                        />
                        <button 
                            onClick={fetchGitAgents} 
                                  disabled={isLoading}
                                  className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700 disabled:bg-gray-600 h-[42px] min-w-[80px]"
                        >
                                  Fetch
                              </button>
                              <div className="w-px bg-gray-600 mx-1"></div>
                              <button
                                  onClick={handleLoadLocalAgents}
                                  disabled={isLoading}
                                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-600 h-[42px] whitespace-nowrap flex items-center gap-2"
                                  title="Select a local folder containing agent subdirectories"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                  </svg>
                                  Local Folder
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Filters */}
                  {agents.length > 0 && (
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
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
              {/* Catalog View */}
              {isLoading ? (
            <Spinner />
              ) : error ? (
                  <div className="text-center text-red-400 p-8 bg-gray-800 rounded-lg">{error}</div>
              ) : filteredAgents.length === 0 ? (
            <div className="text-center text-gray-500 p-12 bg-gray-800 rounded-lg border border-gray-700 border-dashed">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.604 9.604 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-medium text-gray-300">No Samples Found</h3>
                              <p className="mt-1">Check the URL or select a local folder.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                  {filteredAgents.map(agent => (
                                      <AgentCard 
                        key={agent.name} 
                        agent={agent} 
                                          onSelect={handleSelectAgent}
                    />
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default AgentCatalogPage;
