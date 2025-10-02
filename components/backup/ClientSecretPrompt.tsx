import React, { useState } from 'react';

interface ClientSecretPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (secret: string) => void;
  authId: string;
  customMessage?: string;
}

const ClientSecretPrompt: React.FC<ClientSecretPromptProps> = ({ isOpen, onClose, onSubmit, authId, customMessage }) => {
  const [secret, setSecret] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (secret.trim()) {
      onSubmit(secret);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <header className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Enter Client Secret</h2>
        </header>

        <main className="p-6 space-y-4">
            {customMessage ? (
              <p className="text-sm text-yellow-300 bg-yellow-900/30 p-3 rounded-md border border-yellow-700">{customMessage}</p>
            ) : (
              <p className="text-sm text-gray-300">
                  To restore Authorization <code className="bg-gray-700 text-sm p-1 rounded font-mono">{authId}</code>, please enter its OAuth Client Secret.
              </p>
            )}
             <p className="text-xs text-gray-400">
                This information is sensitive and is not stored in the backup file. It is required to re-create the resource.
            </p>
            <div>
                <label htmlFor="client-secret-input" className="block text-sm font-medium text-gray-300">Client Secret</label>
                <input
                    id="client-secret-input"
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                />
            </div>
        </main>

        <footer className="p-4 border-t border-gray-700 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Skip</button>
          <button
            type="submit"
            disabled={!secret.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            Submit Secret
          </button>
        </footer>
      </form>
    </div>
  );
};

export default ClientSecretPrompt;