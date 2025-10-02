import React, { useState, useEffect, useMemo } from 'react';

// A generic item with a unique name and a display name
interface SelectableItem {
  name: string;
  displayName: string;
}

interface RestoreSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedItems: SelectableItem[]) => void;
  title: string;
  items: SelectableItem[];
  isLoading: boolean;
}

const RestoreSelectionModal: React.FC<RestoreSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  items,
  isLoading,
}) => {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // When the modal opens with new items, select all of them by default
  useEffect(() => {
    if (isOpen) {
      setSelectedNames(new Set(items.map(item => item.name)));
    }
  }, [isOpen, items]);

  const allItemNames = useMemo(() => items.map(item => item.name), [items]);

  const handleToggle = (itemName: string) => {
    setSelectedNames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) {
        newSet.delete(itemName);
      } else {
        newSet.add(itemName);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedNames(new Set(allItemNames));
  };

  const handleDeselectAll = () => {
    setSelectedNames(new Set());
  };

  const handleConfirm = () => {
    const selectedItems = items.filter(item => selectedNames.has(item.name));
    onConfirm(selectedItems);
  };
  
  const isAllSelected = selectedNames.size === items.length && items.length > 0;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-gray-400 mt-1">Select the items you wish to restore from the backup file.</p>
        </header>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-300">
              {selectedNames.size} of {items.length} selected
            </div>
            <div className="space-x-2">
              <button onClick={handleSelectAll} disabled={isAllSelected} className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed">Select All</button>
              <button onClick={handleDeselectAll} disabled={selectedNames.size === 0} className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed">Deselect All</button>
            </div>
          </div>
          
          <ul className="space-y-2 bg-gray-900/50 p-3 rounded-md">
            {items.map(item => {
              const itemId = item.name.split('/').pop() || item.name;
              return (
                <li key={item.name} className="p-2 rounded-md hover:bg-gray-700/50">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedNames.has(item.name)}
                      onChange={() => handleToggle(item.name)}
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                    />
                    <div className="ml-3 text-sm">
                      <span className="font-medium text-white">{item.displayName}</span>
                      <p className="text-gray-400 font-mono text-xs">{itemId}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="p-4 border-t border-gray-700 flex justify-end space-x-3">
          <button onClick={onClose} disabled={isLoading} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || selectedNames.size === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Restoring...' : `Restore ${selectedNames.size} Item(s)`}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default RestoreSelectionModal;
