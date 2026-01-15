import React, { useState, useEffect } from 'react';
import * as api from '../services/apiService';

interface HeaderProjectInputProps {
  projectId: string;
  projectNumber: string;
  onChange: (value: string) => void;
}

const HeaderProjectInput: React.FC<HeaderProjectInputProps> = ({ projectId, projectNumber, onChange }) => {
  const [inputValue, setInputValue] = useState(projectId || projectNumber);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    // Prefer ID for input value defaults, but support number fallback
    setInputValue(projectId || projectNumber);
  }, [projectId, projectNumber]);

  const handleResolve = async () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) {
      onChange('');
      setIsEditing(false);
      return;
    }

    // If user typed a number, we can just pass it through
    if (/^\d+$/.test(trimmedValue)) {
      onChange(trimmedValue);
      setIsEditing(false);
      return;
    }

    // If user typed an ID, resolve it
    setIsLoading(true);
    try {
      const projectNum = await api.getProjectNumber(trimmedValue);
      onChange(projectNum); // Parent will handle the rest
      setIsEditing(false);
    } catch (err: any) {
      alert(`Failed to resolve Project ID: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleResolve();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Project ID or Number"
          className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-48"
          autoFocus
          onBlur={() => { if (!isLoading) setIsEditing(false); }}
        />
        <button
          onMouseDown={handleResolve} // Use onMouseDown to fire before onBlur
          disabled={isLoading}
          className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500"
        >
          {isLoading ? '...' : 'Set'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 group cursor-pointer" onClick={() => setIsEditing(true)}>
      <span className="text-sm font-medium text-gray-400 group-hover:text-gray-300">Project:</span>
      <div className="flex items-baseline gap-1" title="Click to change">
        <span className="text-sm font-bold text-white group-hover:text-blue-300 font-mono">{projectId || 'Not Set'}</span>
        {projectNumber && projectId && projectNumber !== projectId && (
          <span className="text-xs text-gray-500 font-mono">({projectNumber})</span>
        )}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 group-hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    </div>
  );
};

export default HeaderProjectInput;
