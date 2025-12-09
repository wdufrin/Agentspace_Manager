
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { GraphEdge, GraphNode, Page, ReasoningEngine, Agent, NodeType } from '../../types';
import ProjectInput from '../components/ProjectInput';
import ArchitectureGraph from '../components/architecture/ArchitectureGraph';
import CurlInfoModal from '../components/CurlInfoModal';
import DetailsPanel from '../components/architecture/DetailsPanel';
import * as api from '../services/apiService';

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const FullScreenIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 011 1v1.586l2.293-2.293a1 1 0 011.414 1.414L5.414 15H7a1 1 0 010 2H3a1 1 0 01-1-1v-4a1 1 0 011-1zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
);

const ExitFullScreenIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        <path d="M5 5a1 1 0 011-1h4a1 1 0 110 2H7.414l2.293 2.293a1 1 0 01-1.414 1.414L6 7.414V10a1 1 0 11-2 0V5zM15 5a1 1 0 00-1-1h-4a1 1 0 100 2h1.586l-2.293 2.293a1 1 0 101.414 1.414L13 7.414V10a1 1 0 102 0V5zM5 15a1 1 0 001 1h4a1 1 0 100-2H7.414l2.293-2.293a1 1 0 10-1.414-1.414L6 12.586V10a1 1 0 10-2 0v5zM15 15a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L13 12.586V10a1 1 0 112 0v5z" />
        <path fillRule="evenodd" d="M5 8a1 1 0 011-1h1V6a1 1 0 012 0v2.586l2.293-2.293a1 1 0 011.414 1.414L9.414 10l2.293 2.293a1 1 0 01-1.414 1.414L8 11.414V14a1 1 0 01-2 0v-2.586L3.707 13.707a1 1 0 01-1.414-1.414L4.586 10 2.293 7.707a1 1 0 011.414-1.414L6 8.586V8z" clipRule="evenodd" />
    </svg>
);

const CompressIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
       <path fillRule="evenodd" d="M5 8a1 1 0 011-1h1V6a1 1 0 012 0v2.586l2.293-2.293a1 1 0 011.414 1.414L9.414 10l2.293 2.293a1 1 0 01-1.414 1.414L8 11.414V14a1 1 0 01-2 0v-2.586L3.707 13.707a1 1 0 01-1.414-1.414L4.586 10 2.293 7.707a1 1 0 011.414-1.414L6 8.586V8z" clipRule="evenodd" />
    </svg>
);

const MetricCard: React.FC<{ title: string; value: number; icon: React.ReactElement; colorClass: string }> = ({ title, value, icon, colorClass }) => (
    <div className={`bg-gray-900/50 p-4 rounded-lg flex items-center gap-4 border border-gray-700/50 relative overflow-hidden group hover:border-gray-600 transition-colors`}>
        <div className={`p-3 rounded-full bg-opacity-20 ${colorClass.replace('text-', 'bg-')} ${colorClass}`}>
            {icon}
        </div>
        <div className="z-10">
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
        {/* Glow effect */}
        <div className={`absolute -right-4 -bottom-4 w-20 h-20 rounded-full blur-2xl opacity-10 ${colorClass.replace('text-', 'bg-')}`}></div>
    </div>
);

const FilterButton: React.FC<{ label: string; active: boolean; onClick: () => void; color: string }> = ({ label, active, onClick, color }) => (
    <button 
        onClick={onClick}
        className={`
            px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200
            ${active ? `bg-${color}-900/40 text-${color}-200 border-${color}-500 shadow-[0_0_10px_rgba(0,0,0,0.3)]` : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600 hover:text-gray-300'}
        `}
    >
        {label}
    </button>
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
    onScan: parentOnScan
}) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [isLogExpanded, setIsLogExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFullScreen, setIsFullScreen] = useState(false);
    
    // Filter State
    const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(new Set([
        'Agent', 'ReasoningEngine', 'DataStore', 'Engine', 'Assistant', 'CloudRunService'
    ]));

    // Track previous loading state to detect when loading finishes
    const isLoadingRef = useRef(isLoading);
    useEffect(() => {
        if (isLoadingRef.current && !isLoading) { // Transition from true to false
            setIsLogExpanded(false); // Collapse log when scan finishes
        }
        isLoadingRef.current = isLoading;
    }, [isLoading]);
    
    // Handle Escape key to exit full screen
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullScreen) {
                setIsFullScreen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullScreen]);

    const handleScanClick = () => {
        setIsLogExpanded(true);
        parentOnScan();
    };

    const toggleType = (type: NodeType) => {
        setVisibleTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    const handleNodeClick = useCallback((nodeId: string) => {
        setSelectedNodeId(prevId => (prevId === nodeId ? null : nodeId));
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    // Filter Logic for Search & Connectivity
    const { edgesByTarget, edgesBySource } = useMemo(() => {
        const byTarget = new Map<string, GraphEdge[]>();
        const bySource = new Map<string, GraphEdge[]>();

        edges.forEach(edge => {
            if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
            byTarget.get(edge.target)!.push(edge);

            if (!bySource.has(edge.source)) bySource.set(edge.source, []);
            bySource.get(edge.source)!.push(edge);
        });

        return { edgesByTarget: byTarget, edgesBySource: bySource };
    }, [edges]);

    const visibleNodeIds = useMemo(() => {
        // 1. Search Filter
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            const matches = nodes.filter(n => {
                const labelMatch = (n.label || '').toLowerCase().includes(lowerSearch);
                const idMatch = (n.id || '').toLowerCase().includes(lowerSearch);
                return labelMatch || idMatch;
            });
            return new Set(matches.map(n => n.id));
        }

        // 2. Connectivity Filter (if node selected)
        if (!selectedNodeId) return null; // Null means "Show All" (subject to visibleTypes)

        const visible = new Set<string>([selectedNodeId]);
        
        // Traverse Downstream
        const queueDown = [selectedNodeId];
        const visitedDown = new Set<string>([selectedNodeId]);
        while(queueDown.length > 0) {
            const curr = queueDown.shift()!;
            const children = edgesBySource.get(curr) || [];
            children.forEach(e => {
                if (!visitedDown.has(e.target)) {
                    visitedDown.add(e.target);
                    visible.add(e.target);
                    queueDown.push(e.target);
                }
            });
        }

        // Traverse Upstream
        const queueUp = [selectedNodeId];
        const visitedUp = new Set<string>([selectedNodeId]);
        while(queueUp.length > 0) {
            const curr = queueUp.shift()!;
            const parents = edgesByTarget.get(curr) || [];
            parents.forEach(e => {
                if (!visitedUp.has(e.source)) {
                    visitedUp.add(e.source);
                    visible.add(e.source);
                    queueUp.push(e.source);
                }
            });
        }
        
        return visible;
    }, [selectedNodeId, edgesBySource, edgesByTarget, searchTerm, nodes]);

    // Highlighting Logic (Hover)
    const highlightedGraphElements = useMemo(() => {
        if (selectedNodeId) return { nodeIds: null, edgeIds: null };

        const centralNodeId = hoveredNodeId;
        if (!centralNodeId) {
            return { nodeIds: null, edgeIds: null };
        }

        const nodeIdsToHighlight = new Set<string>([centralNodeId]);
        const edgeIdsToHighlight = new Set<string>();

        // Upstream Highlight
        const queueUp = [centralNodeId];
        const visitedUp = new Set<string>([centralNodeId]);
        while (queueUp.length > 0) {
            const curr = queueUp.shift()!;
            const parents = edgesByTarget.get(curr) || [];
            parents.forEach(e => {
                edgeIdsToHighlight.add(e.id);
                if (!visitedUp.has(e.source)) {
                    visitedUp.add(e.source);
                    nodeIdsToHighlight.add(e.source);
                    queueUp.push(e.source);
                }
            });
        }

        // Downstream Highlight
        const queueDown = [centralNodeId];
        const visitedDown = new Set<string>([centralNodeId]);
        while (queueDown.length > 0) {
            const curr = queueDown.shift()!;
            const children = edgesBySource.get(curr) || [];
            children.forEach(e => {
                edgeIdsToHighlight.add(e.id);
                if (!visitedDown.has(e.target)) {
                    visitedDown.add(e.target);
                    nodeIdsToHighlight.add(e.target);
                    queueDown.push(e.target);
                }
            });
        }
        
        return { nodeIds: nodeIdsToHighlight, edgeIds: edgeIdsToHighlight };
    }, [hoveredNodeId, selectedNodeId, edgesBySource, edgesByTarget]);

    const selectedNode = useMemo(() => selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null, [selectedNodeId, nodes]);

    const metrics = useMemo(() => {
        if (nodes.length === 0) {
            return { totalAgents: 0, totalEngines: 0, totalDataStores: 0, totalServices: 0 };
        }
        return {
            totalAgents: nodes.filter(n => n.type === 'Agent').length,
            totalEngines: nodes.filter(n => n.type === 'ReasoningEngine').length,
            totalDataStores: nodes.filter(n => n.type === 'DataStore').length,
            totalServices: nodes.filter(n => n.type === 'CloudRunService').length,
        };
    }, [nodes]);

    // Graph Container Classes logic
    const graphContainerClasses = isFullScreen 
        ? "fixed inset-0 z-50 bg-gray-900 flex flex-col" 
        : "flex-1 bg-gray-900 rounded-lg shadow-md overflow-hidden min-h-[500px] flex flex-col border border-gray-800 relative";

    const graphInnerContainerClasses = isFullScreen
        ? "flex-1 relative flex overflow-hidden"
        : "flex-1 relative flex";

    return (
        <div className="space-y-4 flex flex-col h-full">
            {isInfoModalOpen && (
                <CurlInfoModal infoKey="ArchitectureScan" onClose={() => setIsInfoModalOpen(false)} />
            )}
            
            {/* Header & Controls - Hidden in Full Screen */}
            {!isFullScreen && (
                <div className="bg-gray-800 p-4 rounded-lg shadow-md shrink-0 border border-gray-700">
                    <div className="flex flex-col xl:flex-row gap-6 justify-between">
                        <div className="flex-1 space-y-4">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-white tracking-tight">Project Architecture</h2>
                                <button
                                    onClick={() => setIsInfoModalOpen(true)}
                                    className="text-gray-500 hover:text-white transition-colors"
                                    title="Show API commands"
                                >
                                    <InfoIcon />
                                </button>
                            </div>
                            
                            <div className="flex gap-4">
                                <div className="w-64">
                                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Project</label>
                                    <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={handleScanClick}
                                        disabled={isLoading || !projectNumber}
                                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-md hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 shadow-lg shadow-blue-900/20 h-[38px] min-w-[120px] flex justify-center items-center"
                                    >
                                        {isLoading ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                                Scanning...
                                            </>
                                        ) : 'Scan Project'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Metrics Row (Desktop) */}
                        {nodes.length > 0 && !isLoading && (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:w-2/3">
                                <MetricCard title="Agents" value={metrics.totalAgents} colorClass="text-pink-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
                                <MetricCard title="Reasoning Engines" value={metrics.totalEngines} colorClass="text-red-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                                <MetricCard title="Data Stores" value={metrics.totalDataStores} colorClass="text-cyan-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4" /></svg>} />
                                <MetricCard title="Services" value={metrics.totalServices} colorClass="text-teal-400" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" /></svg>} />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!isFullScreen && (logs.length > 0 || error) && (
                 <div className="bg-gray-800 p-2 px-4 rounded-lg shadow-md border border-gray-700">
                    <button onClick={() => setIsLogExpanded(p => !p)} className="flex justify-between items-center w-full text-left">
                        <h3 className="text-sm font-semibold text-gray-300">Scan Log</h3>
                        <div className="flex items-center gap-2">
                            {error && <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded">Error Detected</span>}
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-400 transition-transform ${isLogExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </div>
                    </button>
                    {isLogExpanded && (
                        <div className="mt-2 border-t border-gray-700 pt-2">
                            {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
                            <pre className="text-[10px] text-gray-400 max-h-32 overflow-y-auto font-mono leading-tight">
                                {logs.join('\n')}
                            </pre>
                        </div>
                    )}
                 </div>
            )}
            
            <div className={graphContainerClasses}>
                {/* Graph Toolbar */}
                {nodes.length > 0 && (
                    <div className="bg-gray-800/80 backdrop-blur-sm p-2 flex flex-wrap gap-3 items-center border-b border-gray-700 z-10 shrink-0">
                        {/* Search */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                <svg className="w-4 h-4 text-gray-500 group-focus-within:text-blue-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                                </svg>
                            </div>
                            <input 
                                type="text" 
                                className="block w-48 p-1.5 pl-10 text-xs text-white border border-gray-600 rounded-full bg-gray-700 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400" 
                                placeholder="Locate resource..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="h-6 w-px bg-gray-600 mx-2 hidden sm:block"></div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-2 flex-1">
                            <FilterButton label="Agents" color="pink" active={visibleTypes.has('Agent')} onClick={() => toggleType('Agent')} />
                            <FilterButton label="Engines" color="red" active={visibleTypes.has('ReasoningEngine')} onClick={() => toggleType('ReasoningEngine')} />
                            <FilterButton label="Data" color="cyan" active={visibleTypes.has('DataStore')} onClick={() => toggleType('DataStore')} />
                            <FilterButton label="Services" color="teal" active={visibleTypes.has('CloudRunService')} onClick={() => toggleType('CloudRunService')} />
                            <FilterButton label="Auth" color="amber" active={visibleTypes.has('Authorization')} onClick={() => toggleType('Authorization')} />
                            <FilterButton label="Infra" color="blue" active={visibleTypes.has('Project')} onClick={() => {
                                toggleType('Project'); toggleType('Location'); toggleType('Collection'); toggleType('Engine');
                            }} />
                        </div>

                        {/* Full Screen Toggle */}
                        <div className="ml-auto flex items-center border-l border-gray-600 pl-3">
                            <button
                                onClick={() => setIsFullScreen(!isFullScreen)}
                                className="p-1.5 text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-600 rounded transition-colors"
                                title={isFullScreen ? "Exit Full Screen (Esc)" : "Full Screen"}
                            >
                                {isFullScreen ? <CompressIcon /> : <FullScreenIcon />}
                            </button>
                        </div>
                    </div>
                )}

                <div className={graphInnerContainerClasses}>
                    <div className="flex-1 relative bg-gray-900">
                        {isLoading && nodes.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                                    <p className="mt-4 text-gray-400">Scanning project resources...</p>
                                </div>
                            </div>
                        ) : !isLoading && nodes.length === 0 && logs.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-500 opacity-50">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012-2v2M7 7h10" /></svg>
                                    <h3 className="text-lg font-medium text-gray-400">No Architecture Scanned</h3>
                                    <p className="mt-1 text-sm">Enter a Project ID and click Scan.</p>
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
                                visibleNodeIds={visibleNodeIds}
                                visibleTypes={visibleTypes}
                                isFullScreen={isFullScreen}
                            />
                        )}
                    </div>
                    <DetailsPanel
                        node={selectedNode}
                        projectNumber={projectNumber}
                        onClose={handleClearSelection}
                        onNavigate={onNavigate}
                        onDirectQuery={onDirectQuery}
                        variant={isFullScreen ? 'floating' : 'sidebar'}
                    />
                </div>
            </div>
        </div>
    );
};

export default ArchitecturePage;
