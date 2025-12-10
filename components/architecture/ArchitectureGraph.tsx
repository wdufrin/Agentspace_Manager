
import React, { useMemo, useCallback, useEffect } from 'react';
import ReactFlow, { 
    Background, 
    Controls, 
    MiniMap, 
    Node as FlowNode, 
    Edge as FlowEdge,
    MarkerType,
    useNodesState,
    useEdgesState,
    ConnectionLineType,
    BackgroundVariant,
    ReactFlowProvider,
    useReactFlow
} from 'reactflow';
import CustomNode from './Node';
import { GraphNode, GraphEdge, NodeType } from '../../types';

interface ArchitectureGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string> | null;
  highlightedEdgeIds: Set<string> | null;
  onNodeHover: (nodeId: string | null) => void;
  visibleNodeIds?: Set<string> | null;
  isFullScreen?: boolean;
}

// Order defines the Y-axis layers
const NODE_TYPE_ORDER: NodeType[] = [
    'Project', 
    'Location', 
    'Collection', 
    'Engine', 
    'Assistant', 
    'Agent', 
    'ReasoningEngine', 
    'CloudRunService',
    'DataStore', 
    'Authorization'
];

// Register custom node type
const nodeTypes = {
    custom: CustomNode,
};

const ArchitectureGraphContent: React.FC<ArchitectureGraphProps> = ({
  nodes,
  edges,
  onNodeClick,
  selectedNodeId,
  highlightedNodeIds,
  highlightedEdgeIds,
  onNodeHover,
  visibleNodeIds,
  isFullScreen
}) => {
    const { fitView } = useReactFlow();

    // Process layout and convert to React Flow format
    const { flowNodes, flowEdges } = useMemo(() => {
        // Filter nodes and edges if visibility set is provided
        let displayNodes = nodes;
        let displayEdges = edges;

        if (visibleNodeIds) {
            displayNodes = nodes.filter(n => visibleNodeIds.has(n.id));
            displayEdges = edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));
        }

        if (displayNodes.length === 0) return { flowNodes: [], flowEdges: [] };

        // 1. Group by Type for Grid Layout
        const nodesByType = new Map<NodeType, GraphNode[]>();
        displayNodes.forEach(node => {
            if (!nodesByType.has(node.type)) {
                nodesByType.set(node.type, []);
            }
            nodesByType.get(node.type)!.push(node);
        });

        // 2. Calculate Positions
        // We will center the grid based on the max width row to make it look nicer
        const X_GAP = 320;
        const Y_GAP = 200;
        
        let maxRowWidth = 0;
        NODE_TYPE_ORDER.forEach(type => {
            const count = nodesByType.get(type)?.length || 0;
            maxRowWidth = Math.max(maxRowWidth, count);
        });

        const calculatedNodes: FlowNode[] = [];

        NODE_TYPE_ORDER.forEach((type, rowIndex) => {
            const rowNodes = nodesByType.get(type) || [];
            if (rowNodes.length === 0) return;

            // Center this row relative to the max width
            const rowWidth = rowNodes.length;
            const startX = (maxRowWidth - rowWidth) * (X_GAP / 2);

            rowNodes.forEach((node, colIndex) => {
                const x = startX + (colIndex * X_GAP);
                const y = rowIndex * Y_GAP;
                
                calculatedNodes.push({
                    id: node.id,
                    type: 'custom',
                    position: { x, y },
                    data: { 
                        label: node.label, 
                        type: node.type, 
                        fullId: node.id,
                        isDimmed: highlightedNodeIds ? !highlightedNodeIds.has(node.id) : false 
                    },
                    selected: node.id === selectedNodeId,
                });
            });
        });

        // 3. Create Edges
        const calculatedEdges: FlowEdge[] = displayEdges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            animated: true,
            style: { 
                stroke: highlightedEdgeIds && highlightedEdgeIds.has(edge.id) ? '#60a5fa' : '#4b5563', 
                strokeWidth: highlightedEdgeIds && highlightedEdgeIds.has(edge.id) ? 3 : 2,
                opacity: highlightedEdgeIds ? (highlightedEdgeIds.has(edge.id) ? 1 : 0.2) : 1
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: highlightedEdgeIds && highlightedEdgeIds.has(edge.id) ? '#60a5fa' : '#4b5563',
            },
        }));

        return { flowNodes: calculatedNodes, flowEdges: calculatedEdges };
    }, [nodes, edges, selectedNodeId, visibleNodeIds, highlightedNodeIds, highlightedEdgeIds]);

    // Use internal state for interactivity
    const [rfNodes, setNodes, onNodesChange] = useNodesState(flowNodes);
    const [rfEdges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

    // Sync props with state when they change
    useEffect(() => {
        setNodes(flowNodes);
        setEdges(flowEdges);
    }, [flowNodes, flowEdges, setNodes, setEdges]);

    // Create a stable identifier for the set of nodes currently displayed
    const nodeSetIdentifier = useMemo(() => {
        return flowNodes.map(n => n.id).sort().join(',');
    }, [flowNodes]);

    // Auto-Fit View when relevant data changes or view mode changes
    useEffect(() => {
        // Use a timeout + RAF sequence to ensure the DOM has fully updated 
        // and ReactFlow has processed the new nodes before attempting to fit view.
        const t = setTimeout(() => {
            window.requestAnimationFrame(() => {
                fitView({ padding: 0.2, duration: 800 });
            });
        }, 200); 
        return () => clearTimeout(t);
    }, [fitView, nodeSetIdentifier, selectedNodeId, isFullScreen]);

    const handleNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
        onNodeClick(node.id);
    }, [onNodeClick]);

    return (
        <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onNodeMouseEnter={(_, node) => onNodeHover(node.id)}
                onNodeMouseLeave={() => onNodeHover(null)}
                nodeTypes={nodeTypes}
                connectionLineType={ConnectionLineType.SmoothStep}
                fitView
                minZoom={0.1}
            >
                <Background color="#374151" gap={20} variant={BackgroundVariant.Dots} />
                <Controls className="!bg-gray-800 !border-gray-700 !fill-gray-300" />
                <MiniMap 
                    nodeColor={(n) => {
                        const type = n.data.type as NodeType;
                        switch(type) {
                            case 'Project': return '#3b82f6';
                            case 'Agent': return '#ec4899';
                            case 'ReasoningEngine': return '#ef4444';
                            case 'DataStore': return '#06b6d4';
                            default: return '#4b5563';
                        }
                    }} 
                    className="!bg-gray-800 !border-gray-700 !rounded-lg" 
                />
            </ReactFlow>
        </div>
    );
};

const ArchitectureGraph: React.FC<ArchitectureGraphProps> = (props) => (
    <ReactFlowProvider>
        <ArchitectureGraphContent {...props} />
    </ReactFlowProvider>
);

export default ArchitectureGraph;
