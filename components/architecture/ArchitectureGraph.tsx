
import React, { useMemo, useCallback } from 'react';
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
    ReactFlowProvider
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
  onNodeHover,
  visibleNodeIds
}) => {
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
        const X_START = 50;
        const Y_START = 50;
        const X_GAP = 300;
        const Y_GAP = 150;

        const calculatedNodes: FlowNode[] = [];

        NODE_TYPE_ORDER.forEach((type, rowIndex) => {
            const rowNodes = nodesByType.get(type) || [];
            rowNodes.forEach((node, colIndex) => {
                const x = X_START + (colIndex * X_GAP);
                const y = Y_START + (rowIndex * Y_GAP);
                
                calculatedNodes.push({
                    id: node.id,
                    type: 'custom',
                    position: { x, y },
                    data: { 
                        label: node.label, 
                        type: node.type, 
                        fullId: node.id,
                        isDimmed: false // Dimming handled by visibility filtering now
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
            style: { stroke: '#4b5563', strokeWidth: 2 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#4b5563',
            },
        }));

        return { flowNodes: calculatedNodes, flowEdges: calculatedEdges };
    }, [nodes, edges, selectedNodeId, visibleNodeIds]);

    // Use internal state for interactivity
    const [rfNodes, setNodes, onNodesChange] = useNodesState(flowNodes);
    const [rfEdges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

    // Sync props with state when they change
    React.useEffect(() => {
        setNodes(flowNodes);
        setEdges(flowEdges);
    }, [flowNodes, flowEdges, setNodes, setEdges]);

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
                            default: return '#4b5563';
                        }
                    }} 
                    className="!bg-gray-800 !border-gray-700" 
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
