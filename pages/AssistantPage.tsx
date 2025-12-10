
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Agent, AppEngine, Assistant, Config } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import AssistantDetailsForm from '../components/assistants/AssistantDetailsForm';
import AgentListForAssistant from '../components/assistants/AgentListForAssistant';
import ExportMetricsModal from '../components/assistants/ExportMetricsModal';
import AnalyticsMetricsViewer from '../components/assistants/AnalyticsMetricsViewer';

interface AssistantPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

interface AssistantRowData {
    engine: AppEngine;
    assistant: Assistant | null;
    error?: string;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('assistantPageConfig');
    if (savedConfig) return JSON.parse(savedConfig);
  } catch (e) { console.error("Failed to parse config", e); }
  return { appLocation: 'global' };
};

const StatusBadge: React.FC<{ active: boolean; text?: string }> = ({ active, text }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${active ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-700 text-gray-400 border border-gray-600'}`}>
        {text || (active ? 'Enabled' : 'Disabled')}
    </span>
);

const CountBadge: React.FC<{ count: number }> = ({ count }) => (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${count > 0 ? 'bg-blue-900/50 text-blue-300 border border-blue-700' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
        {count}
    </span>
);

const AssistantPage: React.FC<AssistantPageProps> = ({ projectNumber, setProjectNumber }) => {
  const [config, setConfig] = useState(getInitialConfig);
  
  // List View State
  const [rows, setRows] = useState<AssistantRowData[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Detail View State
  const [selectedRow, setSelectedRow] = useState<AssistantRowData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem('assistantPageConfig', JSON.stringify(config));
  }, [config]);

  const baseApiConfig: Config = useMemo(() => ({
    projectId: projectNumber,
    appLocation: config.appLocation,
    collectionId: 'default_collection',
    appId: '', // Dynamic
    assistantId: 'default_assistant'
  }), [projectNumber, config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    setRows([]); // Clear list on location change
    setSelectedRow(null);
  };

  // Fetch All Engines and their Assistants
  const fetchList = useCallback(async () => {
    if (!projectNumber) {
        setListError("Project Number is required.");
        return;
    }
    setIsListLoading(true);
    setListError(null);
    setRows([]);

    try {
        // 1. List Engines
        const enginesRes = await api.listResources('engines', { ...baseApiConfig, appId: '' });
        const engines: AppEngine[] = enginesRes.engines || [];

        if (engines.length === 0) {
            setRows([]);
            setIsListLoading(false);
            return;
        }

        // 2. Fetch Default Assistant for each Engine (Parallel)
        const rowPromises = engines.map(async (engine) => {
            const appId = engine.name.split('/').pop()!;
            // Suppress error log because 404 is expected for some engines (e.g. Chat)
            const assistantConfig = { ...baseApiConfig, appId, suppressErrorLog: true };
            const assistantName = `projects/${baseApiConfig.projectId}/locations/${baseApiConfig.appLocation}/collections/default_collection/engines/${appId}/assistants/default_assistant`;
            
            try {
                const assistant = await api.getAssistant(assistantName, assistantConfig);
                return { engine, assistant };
            } catch (e: any) {
                // If assistant doesn't exist (e.g. Chat app), we just return null assistant to filter it out
                // console.warn(`Failed to fetch assistant for engine ${appId}`, e);
                return { engine, assistant: null, error: e.message };
            }
        });

        const results = await Promise.all(rowPromises);
        // Filter out rows where assistant is missing (likely not a Search/Assistant engine or deleted assistant)
        const validRows = results.filter(row => row.assistant !== null);
        setRows(validRows);

    } catch (err: any) {
        setListError(err.message || "Failed to fetch engines list.");
    } finally {
        setIsListLoading(false);
    }
  }, [baseApiConfig, projectNumber]);

  // Auto-refresh when config changes
  useEffect(() => {
      fetchList();
  }, [fetchList]);

  // Fetch Agents for a specific Assistant (Detail View)
  const fetchAgentsForAssistant = useCallback(async (appId: string) => {
      setIsDetailLoading(true);
      const detailConfig = { ...baseApiConfig, appId };
      try {
          const agentsResponse = await api.listResources('agents', detailConfig);
          const baseAgents = agentsResponse.agents || [];
          
          if (baseAgents.length > 0) {
            const agentViewPromises = baseAgents.map(agent => api.getAgentView(agent.name, detailConfig));
            const agentViewResults = await Promise.allSettled(agentViewPromises);
            
            const enrichedAgents = baseAgents.map((agent, index) => {
                const viewResult = agentViewResults[index];
                if (viewResult.status === 'fulfilled' && viewResult.value.agentView) {
                    return {
                        ...agent,
                        agentType: viewResult.value.agentView.agentType,
                        agentOrigin: viewResult.value.agentView.agentOrigin,
                    };
                }
                return agent;
            });
            setAgents(enrichedAgents);
          } else {
              setAgents([]);
          }
      } catch (e) {
          console.error("Failed to fetch agents", e);
          setAgents([]);
      } finally {
          setIsDetailLoading(false);
      }
  }, [baseApiConfig]);

  const handleRowClick = (row: AssistantRowData) => {
      if (!row.assistant) return; // Cannot edit if assistant fetch failed
      setSelectedRow(row);
      fetchAgentsForAssistant(row.engine.name.split('/').pop()!);
  };

  const handleBack = () => {
      setSelectedRow(null);
      setAgents([]);
      // Refresh list to show updated data
      fetchList(); 
  };

  const handleUpdateSuccess = (updatedAssistant: Assistant) => {
      if (selectedRow) {
          setSelectedRow({ ...selectedRow, assistant: updatedAssistant });
      }
  };

  // --- Render List View ---
  const renderList = () => (
      <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Gemini Enterprise Engines</h3>
              <button 
                  onClick={fetchList} 
                  disabled={isListLoading}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
              >
                  {isListLoading ? 'Scanning...' : 'Refresh List'}
              </button>
          </div>
          
          {listError && <div className="p-4 text-red-400 bg-red-900/20 text-center text-sm border-b border-red-900/50">{listError}</div>}
          
          <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700/50">
                      <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Engine ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Web Grounding</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">System Instructions</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Customer Policy</th>
                          <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Vertex Agents</th>
                          <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Tools</th>
                          <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                          <th scope="col" className="relative px-6 py-3"><span className="sr-only">Edit</span></th>
                      </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {rows.length === 0 && !isListLoading && (
                          <tr>
                              <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                                  No engines with default assistants found in this location.
                              </td>
                          </tr>
                      )}
                      {rows.map((row) => {
                          const engineId = row.engine.name.split('/').pop()!;
                          const assistant = row.assistant;
                          
                          if (!assistant) {
                              return null; // Should be filtered out already, but safe guard
                          }

                          const hasWebGrounding = assistant.webGroundingType === 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH';
                          const hasInstructions = !!assistant.generationConfig?.systemInstruction?.additionalSystemInstruction;
                          const hasPolicy = !!(assistant.customerPolicy && Object.keys(assistant.customerPolicy).length > 0);
                          const vertexAgentsCount = assistant.vertexAiAgentConfigs?.length || 0;
                          const toolsCount = Object.keys(assistant.enabledTools || {}).length;
                          const actionsCount = Object.keys(assistant.enabledActions || {}).length;

                          return (
                              <tr key={engineId} className="hover:bg-gray-700/50 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm font-medium text-white">{row.engine.displayName}</div>
                                      <div className="text-xs text-gray-500 font-mono">{engineId}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <StatusBadge active={hasWebGrounding} />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <StatusBadge active={hasInstructions} text={hasInstructions ? 'Yes' : 'No'} />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <StatusBadge active={hasPolicy} text={hasPolicy ? 'Applied' : 'None'} />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <CountBadge count={vertexAgentsCount} />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <CountBadge count={toolsCount} />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                      <CountBadge count={actionsCount} />
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                      <button onClick={() => handleRowClick(row)} className="text-blue-400 hover:text-blue-300 font-semibold">
                                          View / Edit
                                      </button>
                                  </td>
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>
      </div>
  );

  // --- Render Detail View ---
  const renderDetail = () => {
      if (!selectedRow || !selectedRow.assistant) return null;
      
      const currentConfig = { 
          ...baseApiConfig, 
          appId: selectedRow.engine.name.split('/').pop()! 
      };

      return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-white">{selectedRow.engine.displayName}</h2>
                        <p className="text-sm text-gray-400 font-mono">{currentConfig.appId}</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsExportModalOpen(true)}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 shadow-md"
                >
                    Backup Metrics
                </button>
            </div>

            {isDetailLoading ? (
                <Spinner />
            ) : (
                <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <AssistantDetailsForm 
                            assistant={selectedRow.assistant}
                            config={currentConfig}
                            onUpdateSuccess={handleUpdateSuccess}
                        />
                        <AgentListForAssistant agents={agents} />
                    </div>
                    <AnalyticsMetricsViewer config={currentConfig} />
                    <ExportMetricsModal
                        isOpen={isExportModalOpen}
                        onClose={() => setIsExportModalOpen(false)}
                        config={currentConfig}
                    />
                </>
            )}
        </div>
      );
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header */}
      {!selectedRow && (
          <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3">Project Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <ProjectInput value={projectNumber} onChange={setProjectNumber} />
              </div>
              <div>
                <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500">
                  <option value="global">global</option>
                  <option value="us">us</option>
                  <option value="eu">eu</option>
                </select>
              </div>
            </div>
          </div>
      )}

      {selectedRow ? renderDetail() : renderList()}
    </div>
  );
};

export default AssistantPage;
