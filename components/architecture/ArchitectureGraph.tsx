import React, { useMemo } from 'react';
import { GraphNode, GraphEdge, NodeType } from '../../types';
import Node from './Node';

interface ArchitectureGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string> | null;
  highlightedEdgeIds: Set<string> | null;
  onNodeHover: (nodeId: string | null) => void;
}

const NODE_TYPE_ORDER: NodeType[] = [
    'Project', 'Location', 'Collection', 'Engine', 'Assistant', 'Agent', 
    'ReasoningEngine', 'DataStore', 'Authorization', 'CloudRunService'
];

const ArchitectureGraph: React.FC<ArchitectureGraphProps> = ({
  nodes,
  onNodeClick,
  selectedNodeId,
  highlightedNodeIds,
  onNodeHover,
}) => {
  const nodesByType = useMemo(() => {
    const grouped = new Map<NodeType, GraphNode[]>();
    nodes.forEach(node => {
      if (!grouped.has(node.type)) {
        grouped.set(node.type, []);
      }
      grouped.get(node.type)!.push(node);
    });
    return grouped;
  }, [nodes]);

  return (
    <div className="w-full h-full overflow-auto p-4 relative">
        <div className="relative w-full">
            {/* The SVG overlay for drawing lines has been removed for a cleaner look. */}
            <div className="space-y-8">
              {NODE_TYPE_ORDER.map(nodeType => {
                const groupNodes = nodesByType.get(nodeType);
                if (!groupNodes || groupNodes.length === 0) return null;
                
                // If a node is selected, only render the nodes that are part of the highlighted path.
                // Otherwise (just hovering or nothing), render all nodes, and the `isDimmed` prop will handle hover highlighting.
                const nodesToRender = selectedNodeId
                    ? groupNodes.filter(node => highlightedNodeIds?.has(node.id))
                    : groupNodes;

                if (nodesToRender.length === 0) return null;
                
                return (
                  <div key={nodeType} className="relative flex items-start min-h-[80px]">
                    <div className="sticky left-0 top-4 w-32 shrink-0 self-center pr-4 z-10">
                      <h3 className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-r-2 border-gray-600 pr-4 py-1">
                        {nodeType.replace(/([A-Z])/g, ' $1').trim()}s
                      </h3>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-4 pl-4">
                      {nodesToRender.map(node => {
                        // When a node is selected, `isDimmed` will be false because we filtered already.
                        // When no node is selected, this correctly dims nodes not on the hover path.
                        const isDimmed = !!highlightedNodeIds && !highlightedNodeIds.has(node.id);
                        return (
                          <Node
                            key={node.id}
                            node={node}
                            isSelected={selectedNodeId === node.id}
                            isDimmed={isDimmed}
                            onClick={() => onNodeClick(node.id)}
                            onMouseEnter={() => onNodeHover(node.id)}
                            onMouseLeave={() => onNodeHover(null)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
    </div>
  );
};

export default ArchitectureGraph;