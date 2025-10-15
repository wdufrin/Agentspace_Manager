import React, { useState, useEffect } from 'react';
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';

interface SetIamPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPolicy: any) => void;
  agent: Agent;
  config: Config;
  currentPolicy: any;
}

const ALLOWED_ROLES = [
    'roles/discoveryengine.agentUser',
    'roles/discoveryengine.agentEditor',
    'roles/discoveryengine.agentViewer',
];

const SetIamPolicyModal: React.FC<SetIamPolicyModalProps> = ({ isOpen, onClose, onSuccess, agent, config, currentPolicy }) => {
  const [editablePolicy, setEditablePolicy] = useState<any | null>(null);
  const [newMembers, setNewMembers] = useState<{ [role: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentPolicy) {
      // Create a deep copy to edit, and ensure bindings is an array
      const policyCopy = JSON.parse(JSON.stringify(currentPolicy));
      if (!policyCopy.bindings) {
        policyCopy.bindings = [];
      }
      setEditablePolicy(policyCopy);
      
      // Reset form state
      setNewMembers({});
      setError(null);
    }
  }, [isOpen, currentPolicy]);

  const handleRemoveMember = (role: string, memberToRemove: string) => {
    setEditablePolicy((prevPolicy: any) => {
      const newPolicy = JSON.parse(JSON.stringify(prevPolicy));
      const binding = newPolicy.bindings.find((b: any) => b.role === role);
      if (binding) {
        binding.members = binding.members.filter((m: string) => m !== memberToRemove);
      }
      return newPolicy;
    });
  };

  const handleAddMember = (role: string) => {
    const membersToAdd = (newMembers[role] || '').split(/[\s,]+/).filter(m => m.trim() !== '');
    if (membersToAdd.length === 0) return;

    setEditablePolicy((prevPolicy: any) => {
      const newPolicy = JSON.parse(JSON.stringify(prevPolicy));
      let binding = newPolicy.bindings.find((b: any) => b.role === role);

      if (!binding) {
        binding = { role, members: [] };
        newPolicy.bindings.push(binding);
      }
      
      const existingMembers = new Set(binding.members);
      membersToAdd.forEach(member => existingMembers.add(member));
      binding.members = Array.from(existingMembers);
      
      return newPolicy;
    });

    // Clear input field after adding
    setNewMembers(prev => ({ ...prev, [role]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editablePolicy || !currentPolicy?.etag) {
        setError("Cannot update policy: ETag is missing. Please fetch the policy again.");
        return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
        const finalPolicy = JSON.parse(JSON.stringify(editablePolicy));
        // Remove any bindings that are now empty
        finalPolicy.bindings = finalPolicy.bindings.filter((b: any) => b.members && b.members.length > 0);
        // Ensure the etag from the original policy is present for optimistic concurrency control
        finalPolicy.etag = currentPolicy.etag;
        
        const responsePolicy = await api.setAgentIamPolicy(agent.name, finalPolicy, config);
        onSuccess(responsePolicy);

    } catch (err: any) {
        setError(err.message || "An unknown error occurred while updating the policy.");
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (!isOpen || !editablePolicy) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <header className="p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Edit IAM Policy for Agent</h2>
              <p className="text-sm text-gray-400 mt-1">{agent.displayName}</p>
            </header>

            <main className="p-6 space-y-4 overflow-y-auto flex-1">
              {ALLOWED_ROLES.map(role => {
                const binding = editablePolicy.bindings.find((b: any) => b.role === role);
                const currentMembers = binding?.members || [];
                return (
                  <div key={role} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                    <h3 className="font-semibold text-white">{role.split('/').pop()}</h3>
                    <p className="text-xs text-gray-400 font-mono">{role}</p>

                    <div className="mt-3">
                      {currentMembers.length > 0 ? (
                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                          {currentMembers.map((member: string) => (
                            <li key={member} className="flex justify-between items-center text-sm bg-gray-700 p-2 rounded-md">
                              <span className="font-mono text-gray-300">{member}</span>
                              <button 
                                type="button" 
                                onClick={() => handleRemoveMember(role, member)}
                                className="p-1 text-gray-400 hover:text-white hover:bg-red-500 rounded-full"
                                aria-label={`Remove ${member}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No members assigned to this role.</p>
                      )}
                    </div>
                    
                    <div className="mt-4 flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="user:new@example.com"
                            value={newMembers[role] || ''}
                            onChange={(e) => setNewMembers(prev => ({...prev, [role]: e.target.value}))}
                            className="flex-grow bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white font-mono h-10 px-3"
                        />
                        <button 
                            type="button"
                            onClick={() => handleAddMember(role)}
                            disabled={!(newMembers[role] || '').trim()}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed h-10 shrink-0"
                        >
                            Add Member
                        </button>
                    </div>
                  </div>
                )
              })}
              {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
            </main>

            <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
                <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Cancel</button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
            </footer>
        </form>
      </div>
    </div>
  );
};

export default SetIamPolicyModal;