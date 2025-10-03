
import React from 'react';
import { Document } from '../../types';

interface DocumentDetailsProps {
  document: Document;
}

const DocumentDetails: React.FC<DocumentDetailsProps> = ({ document }) => {
  
  const jsonString = JSON.stringify(document, null, 2);
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-inner border border-gray-700">
        <header className="p-3 border-b border-gray-700">
            <h4 className="text-md font-semibold text-white">
                Selected Resource Details
            </h4>
        </header>
        <div className="p-3 max-h-[30rem] overflow-y-auto">
            <pre className="text-xs text-gray-200 whitespace-pre-wrap break-all">
                <code>{jsonString}</code>
            </pre>
        </div>
    </div>
  );
};

export default DocumentDetails;
