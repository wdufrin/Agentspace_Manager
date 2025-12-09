
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
// import 'reactflow/dist/style.css'; // Removed: Loaded via CDN in index.html
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
  // New prop to allow filtering by type from the parent page
  visibleTypes?: Set<NodeType>;
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

const nodeTypes = {
    custom: CustomNode,
};

const ArchitectureGraphContent: React.FC<ArchitectureGraphProps> = ({
  nodes,
  edges,
  onNodeClick,
  selectedNodeId,
  onNodeHover,
  visibleNodeIds,
  visibleTypes,
  isFullScreen
}) => {
    const { fitView } = useReactFlow();

    // Process layout and convert to React Flow format
    const { flowNodes, flowEdges } = useMemo(() => {
        // 1. Filter Nodes based on Types AND Visiblity Graph logic
        let displayNodes = nodes;
        let displayEdges = edges;

        // Filter by Type Toggle (from Toolbar)
        if (visibleTypes) {
            displayNodes = displayNodes.filter(n => visibleTypes.has(n.type));
        }

        // Filter by Isolation (Selection or Search)
        if (visibleNodeIds) {
            displayNodes = displayNodes.filter(n => visibleNodeIds.has(n.id));
        }

        // Only show edges where both source and target exist in the filtered node set
        const nodeIds = new Set(displayNodes.map(n => n.id));
        displayEdges = displayEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

        if (displayNodes.length === 0) return { flowNodes: [], flowEdges: [] };

        // 2. Group by Type for Layout Calculation
        const nodesByType = new Map<NodeType, GraphNode[]>();
        displayNodes.forEach(node => {
            if (!nodesByType.has(node.type)) {
                nodesByType.set(node.type, []);
            }
            nodesByType.get(node.type)!.push(node);
        });

        // 3. Calculate Positions (Centered Pyramid Layout)
        // Constants for spacing
        const NODE_WIDTH = 256; // w-64 = 16rem = 256px
        const X_GAP = 300;      // Horizontal spacing
        const Y_GAP = 180;      // Vertical spacing
        const Y_START = 50;

        const calculatedNodes: FlowNode[] = [];

        // Find the widest row to center everything relative to it
        // Or just center around x=0
        
        NODE_TYPE_ORDER.forEach((type, rowIndex) => {
            const rowNodes = nodesByType.get(type) || [];
            if (rowNodes.length === 0) return;

            const rowWidth = rowNodes.length * X_GAP;
            const startX = -(rowWidth / 2) + (X_GAP / 2); // Center the row at x=0

            rowNodes.forEach((node, colIndex) => {
                const x = startX + (colIndex * X_GAP);
                const y = Y_START + (rowIndex * Y_GAP);
                
                // Dimming logic removed as we are now isolating views
                const isDimmed = false;

                calculatedNodes.push({
                    id: node.id,
                    type: 'custom',
                    position: { x, y },
                    data: { 
                        label: node.label, 
                        type: node.type, 
                        fullId: node.id,
                        isDimmed
                    },
                    selected: node.id === selectedNodeId,
                    zIndex: node.id === selectedNodeId ? 1000 : 1
                });
            });
        });

        // 4. Create Edges
        const calculatedEdges: FlowEdge[] = displayEdges.map(edge => {
            const isSelected = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);
            
            return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                type: 'default', // Bezier curve
                animated: isSelected, 
                style: { 
                    stroke: isSelected ? '#60a5fa' : '#4b5563', 
                    strokeWidth: isSelected ? 3 : 1.5,
                    opacity: 1
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: isSelected ? '#60a5fa' : '#4b5563',
                },
                zIndex: isSelected ? 1000 : 0
            };
        });

        return { flowNodes: calculatedNodes, flowEdges: calculatedEdges };
    }, [nodes, edges, selectedNodeId, visibleNodeIds, visibleTypes]);

    // Internal state handling for React Flow
    const [rfNodes, setNodes, onNodesChange] = useNodesState(flowNodes);
    const [rfEdges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

    // Sync props with state
    useEffect(() => {
        setNodes(flowNodes);
        setEdges(flowEdges);
    }, [flowNodes, flowEdges, setNodes, setEdges]);

    // Auto-fit view when selection state changes (select or deselect)
    useEffect(() => {
        // Use a timeout to ensure the DOM has updated with the new nodes (isolated or full)
        const timer = setTimeout(() => {
            fitView({ duration: 800, padding: 0.1 });
        }, 150);
        return () => clearTimeout(timer);
    }, [selectedNodeId, fitView]);

    // Auto-fit view when full screen mode changes
    useEffect(() => {
        const timer = setTimeout(() => {
            fitView({ duration: 800, padding: 0.1 });
        }, 300); // Slightly longer delay to account for potential CSS transition
        return () => clearTimeout(timer);
    }, [isFullScreen, fitView]);

    const handleNodeClick = useCallback((_: React.MouseEvent, node: FlowNode) => {
        onNodeClick(node.id);
    }, [onNodeClick]);

    return (
        <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-700 relative group">
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onNodeMouseEnter={(_, node) => onNodeHover(node.id)}
                onNodeMouseLeave={() => onNodeHover(null)}
                nodeTypes={nodeTypes}
                connectionLineType={ConnectionLineType.Bezier}
                fitView
                minZoom={0.1}
                maxZoom={2}
                defaultEdgeOptions={{ type: 'default', animated: true }}
            >
                <Background color="#374151" gap={24} size={1.5} variant={BackgroundVariant.Dots} className="opacity-50" />
                <Controls className="!bg-gray-800 !border-gray-700 !fill-gray-300 !shadow-xl" />
                <MiniMap 
                    nodeColor={(n) => {
                        const type = n.data.type as NodeType;
                        // Match colors roughly to Node.tsx styles
                        switch(type) {
                            case 'Project': return '#3b82f6';
                            case 'Agent': return '#ec4899';
                            case 'ReasoningEngine': return '#ef4444';
                            case 'DataStore': return '#06b6d4';
                            default: return '#4b5563';
                        }
                    }} 
                    className="!bg-gray-800 !border-gray-700 !rounded-lg !overflow-hidden !shadow-xl" 
                    maskColor="rgba(0, 0, 0, 0.6)"
                />
            </ReactFlow>
            {/* Hint overlay */}
            <div className="absolute top-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="bg-black/60 backdrop-blur-sm text-gray-300 text-xs px-3 py-1.5 rounded-full border border-white/10">
                    Scroll to zoom • Drag to pan • Click to focus
                </div>
            </div>
        </div>
    );
};

const ArchitectureGraph: React.FC<ArchitectureGraphProps> = (props) => (
    <ReactFlowProvider>
        <ArchitectureGraphContent {...props} />
    </ReactFlowProvider>
);

export default ArchitectureGraph;
