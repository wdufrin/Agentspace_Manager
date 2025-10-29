import React, { useState, useMemo, useCallback } from 'react';
import { Agent, AppEngine, Assistant, Authorization, Config, DataStore, GraphEdge, GraphNode, ReasoningEngine } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import ArchitectureGraph from '../components/architecture/ArchitectureGraph';
import CurlInfoModal from '../components/CurlInfoModal';

const ALL_REASONING_ENGINE_LOCATIONS = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1',
    'europe-west1', 'europe-west2', 'europe-west4',
    'asia-east1', 'asia-southeast1'
];
const ALL_DISCOVERY_LOCATIONS = ['global', 'us', 'eu'];

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const ArchitecturePage: React.FC<{ projectNumber: string; setProjectNumber: (projectNumber: string) => void; }> = ({ projectNumber, setProjectNumber }) => {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [filterNodeId, setFilterNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      appLocation: 'global',
      collectionId: '',
      appId: '',
      assistantId: '',
    }), [projectNumber]);

    const addLog = useCallback((message: string) => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    }, []);

    const handleNodeClick = useCallback((nodeId: string) => {
        setFilterNodeId(prevId => (prevId === nodeId ? null : nodeId));
    }, []);

    const handleClearFilter = useCallback(() => {
        setFilterNodeId(null);
    }, []);

    const { edgesByTarget, edgesBySource } = useMemo(() => {
        const byTarget = new Map<string, GraphEdge>();
        const bySource = new Map<string, GraphEdge[]>();

        edges.forEach(edge => {
            byTarget.set(edge.target, edge);
            if (!bySource.has(edge.source)) {
                bySource.set(edge.source, []);
            }
            bySource.get(edge.source)!.push(edge);
        });

        return { edgesByTarget: byTarget, edgesBySource: bySource };
    }, [edges]);

    const highlightedGraphElements = useMemo(() => {
        const centralNodeId = hoveredNodeId || filterNodeId;
        if (!centralNodeId) {
            return { nodeIds: null, edgeIds: null };
        }

        const nodeIdsToHighlight = new Set<string>([centralNodeId]);
        const edgeIdsToHighlight = new Set<string>();

        // Full Upstream Traversal (Path to root)
        let upstreamCursor: string | undefined = centralNodeId;
        while (upstreamCursor) {
            const parentEdge = edgesByTarget.get(upstreamCursor);
            if (parentEdge) {
                nodeIdsToHighlight.add(parentEdge.source);
                edgeIdsToHighlight.add(parentEdge.id);
                upstreamCursor = parentEdge.source;
            } else {
                upstreamCursor = undefined; // Reached the root
            }
        }

        // Full Downstream Traversal (all descendants)
        const queue: string[] = [centralNodeId];
        const visited = new Set<string>([centralNodeId]);
        while (queue.length > 0) {
            const currentNodeId = queue.shift()!;
            const childEdges = edgesBySource.get(currentNodeId) || [];
            for (const edge of childEdges) {
                edgeIdsToHighlight.add(edge.id);
                if (!visited.has(edge.target)) {
                    visited.add(edge.target);
                    nodeIdsToHighlight.add(edge.target);
                    queue.push(edge.target);
                }
            }
        }
        
        return { nodeIds: nodeIdsToHighlight, edgeIds: edgeIdsToHighlight };
    }, [hoveredNodeId, filterNodeId, edgesBySource, edgesByTarget]);

    const { displayedNodes, displayedEdges } = useMemo(() => {
        if (!filterNodeId) {
            return { displayedNodes: nodes, displayedEdges: edges };
        }

        const nodeIdsToShow = highlightedGraphElements.nodeIds;
        if (!nodeIdsToShow) {
            const filteredNode = nodes.find(n => n.id === filterNodeId);
            return { displayedNodes: filteredNode ? [filteredNode] : [], displayedEdges: [] };
        }

        const filteredNodes = nodes.filter(node => nodeIdsToShow.has(node.id));
        const filteredEdges = edges.filter(edge => nodeIdsToShow.has(edge.source) && nodeIdsToShow.has(edge.target));

        return { displayedNodes: filteredNodes, displayedEdges: filteredEdges };
    }, [nodes, edges, filterNodeId, highlightedGraphElements]);


    const handleScan = useCallback(async () => {
        if (!projectNumber) {
            setError("Project ID/Number is required to scan the architecture.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setLogs([]);
        setNodes([]);
        setEdges([]);
        setFilterNodeId(null);

        const newNodes: GraphNode[] = [];
        const newEdges: GraphEdge[] = [];
        const foundNodeIds = new Set<string>();

        const addNode = (node: GraphNode) => {
            if (!foundNodeIds.has(node.id)) {
                newNodes.push(node);
                foundNodeIds.add(node.id);
            }
        };

        const addEdge = (sourceId: string, targetId: string) => {
            const edgeId = `${sourceId}__to__${targetId}`;
            if (foundNodeIds.has(sourceId) && foundNodeIds.has(targetId)) {
                 newEdges.push({ id: edgeId, source: sourceId, target: targetId });
            } else {
                addLog(`SKIPPED_EDGE: Cannot draw link from ${sourceId.split('/').pop()} to ${targetId.split('/').pop()} as one of the resources was not found in the scan.`);
            }
        };

        try {
            addLog("Starting architecture scan...");
            
            const projectNodeId = `projects/${projectNumber}`;
            addNode({ id: projectNodeId, type: 'Project', label: `Project (${projectNumber})`, data: { name: projectNodeId } });

            addLog("Fetching all Authorizations and Reasoning Engines...");
            const [authResponse, allReasoningEngines] = await Promise.all([
                api.listAuthorizations(apiConfig).catch(e => { addLog(`WARNING: Could not fetch authorizations: ${e.message}`); return { authorizations: [] }; }),
                Promise.all(ALL_REASONING_ENGINE_LOCATIONS.map(loc =>
                    api.listReasoningEngines({ ...apiConfig, reasoningEngineLocation: loc })
                        .then(res => res.reasoningEngines || [])
                        .catch(e => { addLog(`NOTE: Could not scan Reasoning Engines in ${loc}: ${e.message}`); return []; })
                )).then(results => results.flat())
            ]);

            const authorizations = authResponse.authorizations || [];
            authorizations.forEach(auth => addNode({ id: auth.name, type: 'Authorization', label: auth.name.split('/').pop()!, data: auth }));
            allReasoningEngines.forEach(re => addNode({ id: re.name, type: 'ReasoningEngine', label: re.displayName, data: re }));
            addLog(`Found ${authorizations.length} authorizations and ${allReasoningEngines.length} reasoning engines across all locations.`);

            for (const location of ALL_DISCOVERY_LOCATIONS) {
                addLog(`Scanning discovery location: ${location}...`);
                const locationNodeId = `${projectNodeId}/locations/${location}`;
                addNode({ id: locationNodeId, type: 'Location', label: location, data: { name: locationNodeId } });
                addEdge(projectNodeId, locationNodeId);

                const locationConfig = { ...apiConfig, appLocation: location, collectionId: 'default_collection' };
                
                try {
                    const enginesResponse = await api.listResources('engines', locationConfig);
                    const engines: AppEngine[] = enginesResponse.engines || [];
                    if (engines.length === 0) continue;

                    addLog(`  Found ${engines.length} App/Engine(s) in ${location}.`);
                    for (const engine of engines) {
                        addNode({ id: engine.name, type: 'Engine', label: engine.displayName, data: engine });
                        addEdge(locationNodeId, engine.name);

                        const assistantConfig = { ...locationConfig, appId: engine.name.split('/').pop()!, assistantId: 'default_assistant' };
                        const assistantsResponse = await api.listResources('assistants', assistantConfig);
                        const assistants: Assistant[] = assistantsResponse.assistants || [];

                        for (const assistant of assistants) {
                            addNode({ id: assistant.name, type: 'Assistant', label: assistant.displayName, data: assistant });
                            addEdge(engine.name, assistant.name);

                            const agentsResponse = await api.listResources('agents', assistantConfig);
                            const agents: Agent[] = agentsResponse.agents || [];
                            
                            for (const agent of agents) {
                                addNode({ id: agent.name, type: 'Agent', label: agent.displayName, data: agent });
                                addEdge(assistant.name, agent.name);

                                const reName = agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
                                if (reName) addEdge(agent.name, reName);

                                (agent.authorizations || []).forEach(authName => addEdge(agent.name, authName));

                                try {
                                    const agentView = await api.getAgentView(agent.name, assistantConfig);
                                    const findDataStoreIds = (obj: any): string[] => {
                                        if (!obj || typeof obj !== 'object') return [];
                                        return Object.values(obj).flatMap((value: any) => {
                                            if (typeof value === 'string' && value.includes('/dataStores/')) return [value];
                                            if (typeof value === 'object') return findDataStoreIds(value);
                                            return [];
                                        });
                                    };
                                    const dataStoreIds = [...new Set(findDataStoreIds(agentView))];
                                    for (const dsId of dataStoreIds) {
                                        if (!foundNodeIds.has(dsId)) {
                                            try {
                                                const dataStore = await api.getDataStore(dsId, assistantConfig);
                                                addNode({ id: dsId, type: 'DataStore', label: dataStore.displayName, data: dataStore });
                                            } catch (dsError: any) {
                                                addLog(`WARNING: Could not fetch details for DataStore ${dsId}: ${dsError.message}`);
                                                addNode({ id: dsId, type: 'DataStore', label: dsId.split('/').pop()!, data: { name: dsId, error: 'Could not fetch details' } });
                                            }
                                        }
                                        addEdge(agent.name, dsId);
                                    }
                                } catch (viewError: any) {
                                    addLog(`NOTE: Could not get agent view for ${agent.displayName} to find data stores: ${viewError.message}`);
                                }
                            }
                        }
                    }
                } catch(e: any) {
                    addLog(`NOTE: No resources found or error in location '${location}': ${e.message}`);
                }
            }

            setNodes(newNodes);
            setEdges(newEdges);
            addLog("Scan complete. Rendering graph...");

        } catch (err: any) {
            setError(err.message || 'An unknown error occurred during the scan.');
            addLog(`FATAL ERROR: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [projectNumber, apiConfig, addLog]);

    const filteredNode = useMemo(() => filterNodeId ? nodes.find(n => n.id === filterNodeId) : null, [filterNodeId, nodes]);

    return (
        <div className="space-y-6 flex flex-col h-full">
            {isInfoModalOpen && (
                <CurlInfoModal infoKey="ArchitectureScan" onClose={() => setIsInfoModalOpen(false)} />
            )}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Project Architecture</h2>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <div className="flex items-end gap-2 w-full md:w-auto">
                        <button
                            onClick={handleScan}
                            disabled={isLoading || !projectNumber}
                            className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px] flex items-center justify-center"
                        >
                            {isLoading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                    Scanning...
                                </>
                            ) : 'Scan Project Architecture'}
                        </button>
                        <button
                            onClick={() => setIsInfoModalOpen(true)}
                            className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white h-[42px]"
                            title="Show API commands for scanning"
                        >
                            <InfoIcon />
                        </button>
                    </div>
                </div>
                {filterNodeId && (
                    <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
                        <p className="text-sm text-gray-300">
                            <span className="font-semibold text-yellow-300">Filtered view:</span> Showing dependency chain for <span className="font-bold">{filteredNode?.label || '...'}</span>.
                        </p>
                        <button
                            onClick={handleClearFilter}
                            className="px-3 py-1.5 text-xs bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
                        >
                            Show Full Architecture
                        </button>
                    </div>
                )}
            </div>

            {(logs.length > 0 || error) && (
                 <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                    <h3 className="text-md font-semibold text-white mb-2">Scan Log</h3>
                    {error && <div className="text-sm text-red-400 p-2 mb-2 bg-red-900/20 rounded-md">{error}</div>}
                    <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-32 overflow-y-auto font-mono">
                        {logs.join('\n')}
                    </pre>
                 </div>
            )}
            
            <div className="flex-1 bg-gray-800 rounded-lg shadow-md overflow-hidden min-h-[500px]">
                {isLoading && nodes.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                            <p className="mt-4 text-gray-400">Scanning project resources...</p>
                        </div>
                    </div>
                ) : !isLoading && nodes.length === 0 && logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-gray-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-300">No Architecture to Display</h3>
                            <p className="mt-1 text-sm">Click "Scan Project Architecture" to begin.</p>
                        </div>
                    </div>
                ) : (
                    <ArchitectureGraph
                        nodes={displayedNodes}
                        edges={displayedEdges}
                        onNodeClick={handleNodeClick}
                        filterNodeId={filterNodeId}
                        highlightedNodeIds={highlightedGraphElements.nodeIds}
                        highlightedEdgeIds={highlightedGraphElements.edgeIds}
                        onNodeHover={setHoveredNodeId}
                    />
                )}
            </div>
        </div>
    );
};

export default ArchitecturePage;