import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { GraphEdge, GraphNode, Page, ReasoningEngine } from '../../types';
import ProjectInput from '../components/ProjectInput';
import ArchitectureGraph from '../components/architecture/ArchitectureGraph';
import CurlInfoModal from '../components/CurlInfoModal';
import DetailsPanel from '../components/architecture/DetailsPanel';

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const MetricCard: React.FC<{ title: string; value: number; icon: React.ReactElement }> = ({ title, value, icon }) => (
    <div className="bg-gray-900/50 p-4 rounded-lg flex items-center gap-4 border border-gray-700">
        <div className="p-3 rounded-full bg-blue-600/30 text-blue-300">
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);


interface ArchitecturePageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  onNavigate: (page: Page, context?: any) => void;
  onDirectQuery: (engine: ReasoningEngine) => void;
  // Props for cached state from App.tsx
  nodes: GraphNode[];
  edges: GraphEdge[];
  logs: string[];
  isLoading: boolean;
  error: string | null;
  onScan: () => void;
}

const ArchitecturePage: React.FC<ArchitecturePageProps> = ({ 
    projectNumber, 
    setProjectNumber, 
    onNavigate, 
    onDirectQuery,
    nodes,
    edges,
    logs,
    isLoading,
    error,
    onScan
}) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [isLogExpanded, setIsLogExpanded] = useState(false);
    
    // Track previous loading state to detect when loading finishes
    const isLoadingRef = useRef(isLoading);
    useEffect(() => {
        // This effect runs after the render, so isLoadingRef.current holds the previous value
        if (isLoadingRef.current && !isLoading) { // Transition from true to false
            setIsLogExpanded(false); // Collapse log when scan finishes
        }
        isLoadingRef.current = isLoading;
    }, [isLoading]);
    
    const handleScanClick = () => {
        setIsLogExpanded(true); // Expand log when a new scan starts
        onScan();
    };


    const handleNodeClick = useCallback((nodeId: string) => {
        setSelectedNodeId(prevId => (prevId === nodeId ? null : nodeId));
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedNodeId(null);
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
        const centralNodeId = hoveredNodeId || selectedNodeId;
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
    }, [hoveredNodeId, selectedNodeId, edgesBySource, edgesByTarget]);

    const selectedNode = useMemo(() => selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null, [selectedNodeId, nodes]);

    const metrics = useMemo(() => {
        if (nodes.length === 0) {
            return { totalAgents: 0, totalEngines: 0, totalDataStores: 0, unusedEngines: 0 };
        }
        const agents = nodes.filter(n => n.type === 'Agent');
        const reasoningEngines = nodes.filter(n => n.type === 'ReasoningEngine');
        const dataStores = nodes.filter(n => n.type === 'DataStore');

        const usedEngineIds = new Set<string>();
        edges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            if (sourceNode?.type === 'Agent' && targetNode?.type === 'ReasoningEngine') {
                usedEngineIds.add(targetNode.id);
            }
        });

        const unusedEnginesCount = reasoningEngines.filter(re => !usedEngineIds.has(re.id)).length;

        return {
            totalAgents: agents.length,
            totalEngines: reasoningEngines.length,
            totalDataStores: dataStores.length,
            unusedEngines: unusedEnginesCount,
        };
    }, [nodes, edges]);

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
                            onClick={handleScanClick}
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
            </div>

            {nodes.length > 0 && !isLoading && (
                <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                    <h2 className="text-lg font-semibold text-white mb-3">Environment at a Glance</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard title="Total Agents" value={metrics.totalAgents} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
                        <MetricCard title="Reasoning Engines" value={metrics.totalEngines} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                        <MetricCard title="Data Stores" value={metrics.totalDataStores} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4" /></svg>} />
                        <MetricCard title="Unused Engines" value={metrics.unusedEngines} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
                    </div>
                </div>
            )}

            {(logs.length > 0 || error) && (
                 <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                    <button onClick={() => setIsLogExpanded(p => !p)} className="flex justify-between items-center w-full text-left">
                        <h3 className="text-md font-semibold text-white">Scan Log</h3>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isLogExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    
                    {isLogExpanded && (
                        <div className="mt-2">
                            {error && <div className="text-sm text-red-400 p-2 mb-2 bg-red-900/20 rounded-md">{error}</div>}
                            <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-32 overflow-y-auto font-mono">
                                {logs.join('\n')}
                            </pre>
                        </div>
                    )}
                 </div>
            )}
            
            <div className="flex-1 bg-gray-800 rounded-lg shadow-md overflow-hidden min-h-[500px] flex">
                <div className="flex-1 relative">
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
                            nodes={nodes}
                            edges={edges}
                            onNodeClick={handleNodeClick}
                            selectedNodeId={selectedNodeId}
                            highlightedNodeIds={highlightedGraphElements.nodeIds}
                            highlightedEdgeIds={highlightedGraphElements.edgeIds}
                            onNodeHover={setHoveredNodeId}
                        />
                    )}
                </div>
                <DetailsPanel
                    node={selectedNode}
                    projectNumber={projectNumber}
                    onClose={handleClearSelection}
                    onNavigate={onNavigate}
                    onDirectQuery={onDirectQuery}
                />
            </div>
        </div>
    );
};

export default ArchitecturePage;
