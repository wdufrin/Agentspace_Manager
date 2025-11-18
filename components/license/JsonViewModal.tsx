import React from 'react';

interface JsonViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  title?: string;
}

const JsonViewModal: React.FC<JsonViewModalProps> = ({ isOpen, onClose, data, title = 'JSON Data' }) => {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>
        <main className="p-6 overflow-y-auto">
            <pre className="p-4 bg-gray-900 rounded-lg text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
                <code>{JSON.stringify(data, null, 2)}</code>
            </pre>
        </main>
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default JsonViewModal;