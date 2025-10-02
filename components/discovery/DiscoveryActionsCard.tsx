import React from 'react';
import { DataStoreIcon, EngineIcon, DocumentIcon, AgentIcon } from './icons';

interface DiscoveryActionsCardProps {
    onAction: (resource: string, title: string) => void;
    isLoading: boolean;
}

const Button: React.FC<React.PropsWithChildren<{ onClick: () => void; disabled: boolean; title: string }>> = ({ children, onClick, disabled, title }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="flex items-center justify-center space-x-2 w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 bg-gray-700 text-gray-200 hover:bg-gray-600 hover:text-white disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
    >
        {children}
    </button>
);


const DiscoveryActionsCard: React.FC<DiscoveryActionsCardProps> = ({ onAction, isLoading }) => {
    
    const actions = [
        {
            label: "List Data Stores",
            resource: "dataStores",
            icon: <DataStoreIcon className="w-5 h-5" />,
            tooltip: "Fetches all data stores within the specified Collection ID."
        },
        {
            label: "List Engines",
            resource: "engines",
            icon: <EngineIcon className="w-5 h-5" />,
            tooltip: "Fetches all engines within the specified Collection ID."
        },
        {
            label: "List Documents",
            resource: "documents",
            icon: <DocumentIcon className="w-5 h-5" />,
            tooltip: "Fetches all documents from the specified Data Store ID."
        },
        {
            label: "List Agents",
            resource: "agents",
            icon: <AgentIcon className="w-5 h-5" />,
            tooltip: "Fetches all agents for the specified Engine ID."
        },
    ];

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <h2 className="text-xl font-bold text-white text-center mb-4">Discovery Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
               {actions.map(({ label, resource, icon, tooltip }) => (
                 <Button 
                    key={resource}
                    onClick={() => onAction(resource, label)}
                    disabled={isLoading}
                    title={tooltip}
                >
                    {icon}
                    <span>{label}</span>
                </Button>
               ))}
            </div>
             <p className="text-xs text-gray-500 mt-4 text-center">
                Note: Ensure the required IDs are set in the configuration above before running an action.
            </p>
        </div>
    );
};

export default DiscoveryActionsCard;