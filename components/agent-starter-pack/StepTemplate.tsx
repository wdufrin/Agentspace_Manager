import React from 'react';
import { Template } from '../../pages/AgentStarterPackPage';

interface StepTemplateProps {
    templates: Template[];
    selectedTemplateId: string | null;
    onSelect: (id: string) => void;
}

const StepTemplate: React.FC<StepTemplateProps> = ({ templates, selectedTemplateId, onSelect }) => {
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Select a Template</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {templates.map((template) => (
                    <div
                        key={template.id}
                        onClick={() => onSelect(template.id)}
                        className={`
                            relative p-5 rounded-lg border-2 cursor-pointer transition-all shadow-lg
                            ${selectedTemplateId === template.id 
                                ? 'border-teal-500 bg-gray-800 ring-1 ring-teal-500' 
                                : 'border-gray-700 bg-gray-800 hover:border-teal-400/50 hover:bg-gray-750'
                            }
                        `}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-lg ${selectedTemplateId === template.id ? 'bg-teal-900/50 text-teal-300' : 'bg-gray-700 text-gray-400'}`}>
                                {template.icon}
                            </div>
                            <div>
                                <h4 className="font-bold text-white mb-1">{template.name}</h4>
                                <p className="text-sm text-gray-400 leading-relaxed">{template.description}</p>
                            </div>
                        </div>
                        {selectedTemplateId === template.id && (
                            <div className="absolute top-3 right-3 text-teal-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StepTemplate;
