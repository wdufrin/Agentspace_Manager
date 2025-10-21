import React, { useState } from 'react';

interface AccessTokenInputProps {
  accessToken: string;
  setAccessToken: (token: string) => void;
}

const AccessTokenInput: React.FC<AccessTokenInputProps> = ({ accessToken, setAccessToken }) => {
  const [tokenInput, setTokenInput] = useState(accessToken);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleSave = () => {
    setAccessToken(tokenInput.trim());
  };

  const handleReset = () => {
    setTokenInput('');
    setAccessToken('');
  };

  if (accessToken) {
    return (
      <div className="flex items-center space-x-3 w-full md:w-auto">
        <span className="flex items-center text-sm text-green-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Token Active
        </span>
        <button
          onClick={handleReset}
          className="px-4 py-1.5 bg-yellow-600 text-white text-sm font-semibold rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-yellow-500"
        >
          Reset Token
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 w-full md:w-auto">
      <div className="relative">
         <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-gray-400 hover:text-white"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
        </button>
        {showTooltip && (
            <div className="absolute z-10 w-64 p-2 mt-2 text-sm leading-tight text-white transform md:-translate-x-full bg-gray-700 rounded-lg shadow-lg top-full right-0 md:right-auto">
                <p>To use this application, you need a GCP access token.</p>
                <p className="mt-2">Run the following command in your terminal:</p>
                <code className="block p-2 mt-1 text-xs bg-gray-800 rounded">gcloud auth print-access-token</code>
                <p className="mt-1">Then, paste the output token here.</p>
            </div>
        )}
      </div>
      <input
        type="password"
        value={tokenInput}
        onChange={(e) => setTokenInput(e.target.value)}
        placeholder="Paste GCP Access Token"
        className="flex-grow bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        onClick={handleSave}
        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
      >
        Set Token
      </button>
    </div>
  );
};

export default AccessTokenInput;
