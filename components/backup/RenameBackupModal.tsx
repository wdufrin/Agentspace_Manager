import React, { useState, useEffect } from 'react';
import Button from '../Button';
import * as Icons from '../Icons';

interface RenameBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}

const RenameBackupModal: React.FC<RenameBackupModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentName,
}) => {
  const [newName, setNewName] = useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName !== currentName) {
      onConfirm(newName.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Icons.Edit className="text-indigo-400" size={24} />
            Rename Backup
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <Icons.X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Filename
            </label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              Enter the full new filename (e.g., <code>backup.discovery.v2.json</code>).
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button 
              variant="primary" 
              type="submit" 
              disabled={!newName.trim() || newName === currentName}
              icon="Check"
            >
              Rename
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RenameBackupModal;
