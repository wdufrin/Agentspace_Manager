
import React from 'react';
import { Document } from '../../types';

interface DocumentListProps {
  documents: Document[];
  onSelectDocument: (document: Document) => void;
  selectedDocumentName?: string | null;
}

const DocumentList: React.FC<DocumentListProps> = ({ documents, onSelectDocument, selectedDocumentName }) => {
  if (documents.length === 0) {
    return <p className="text-gray-400 p-4 text-center text-sm italic">No documents found in this data store.</p>;
  }

  return (
    <div className="bg-gray-900/50 rounded-lg overflow-hidden border border-gray-700">
      <div className="overflow-y-auto max-h-96">
        <ul className="divide-y divide-gray-700">
          {documents.map((doc) => {
            const isSelected = selectedDocumentName === doc.name;
            const displayName = doc.content?.uri?.split('/').pop() || doc.id;

            return (
              <li
                key={doc.name}
                onClick={() => onSelectDocument(doc)}
                className={`cursor-pointer transition-colors px-4 py-3 text-sm text-white font-sans truncate ${
                  isSelected ? 'bg-blue-600' : 'hover:bg-gray-700/50'
                }`}
                title={displayName}
              >
                {displayName}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default DocumentList;
