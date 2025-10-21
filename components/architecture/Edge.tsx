import React from 'react';

interface EdgeProps {
    pathData: string;
    isHighlighted: boolean;
    isDimmed: boolean;
}

const Edge: React.FC<EdgeProps> = ({ pathData, isHighlighted, isDimmed }) => {
    const stroke = isHighlighted ? "url(#arrowGradient)" : "rgba(107, 114, 128, 0.6)";
    const strokeWidth = isHighlighted ? 2.5 : 1.5;
    const opacity = isDimmed ? 0.05 : 1;
    const markerId = isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead-normal)";

    return (
        <g style={{ opacity, transition: 'opacity 0.2s ease-in-out' }}>
            <path
                d={pathData}
                stroke={stroke}
                strokeWidth={strokeWidth}
                fill="none"
                markerEnd={markerId}
                style={{
                    transition: 'all 0.2s ease-in-out',
                    filter: isHighlighted ? 'url(#glow)' : 'none',
                }}
            />
        </g>
    );
};

export default Edge;