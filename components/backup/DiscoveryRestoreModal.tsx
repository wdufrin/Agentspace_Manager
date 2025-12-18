import React, { useState, useEffect, useMemo } from 'react';
import Button from '../Button';
import * as Icons from '../Icons';

interface DiscoveryRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedData: any) => void;
  originalData: any;
  isLoading?: boolean;
  title?: string;
}

type ResourceCategory = 'collections' | 'dataStores' | 'engines' | 'assistants' | 'agents' | 'reasoningEngines' | 'authorizations';

const DisplayNames: Record<ResourceCategory, string> = {
  collections: 'Collections',
  dataStores: 'Data Stores',
  engines: 'Apps (Engines)',
  assistants: 'Assistants',
  agents: 'Agents',
  reasoningEngines: 'Reasoning Engines',
  authorizations: 'Authorizations'
};

const RestoreOrder: ResourceCategory[] = [
  'collections',
  'dataStores',
  'engines',
  'assistants',
  'agents',
  'reasoningEngines',
  'authorizations'
];

const DiscoveryRestoreModal: React.FC<DiscoveryRestoreModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  originalData,
  isLoading = false,
  title = "Restore Discovery Resources",
}) => {
  // Store selected IDs for each category
  const [selectedIds, setSelectedIds] = useState<Record<ResourceCategory, Set<string>>>({
    collections: new Set(),
    dataStores: new Set(),
    engines: new Set(),
    assistants: new Set(),
    agents: new Set(),
    reasoningEngines: new Set(),
    authorizations: new Set(),
  });

  const [activeTab, setActiveTab] = useState<ResourceCategory>('collections');

  // Parse items from generic data into lists with IDs
  const resourceLists = useMemo(() => {
    const lists: Record<ResourceCategory, any[]> = {
      collections: [], dataStores: [], engines: [], assistants: [], agents: [], reasoningEngines: [], authorizations: []
    };

    const processItem = (item: any) => ({
      ...item,
      id: item.name ? item.name.split('/').pop() : Math.random().toString(36),
      displayName: item.displayName || item.name || 'Unnamed Resource'
    });

    RestoreOrder.forEach(key => {
      if (originalData && Array.isArray(originalData[key])) {
        lists[key] = originalData[key].map(processItem);
      }
    });

    return lists;
  }, [originalData]);

  // Auto-select all on open
  useEffect(() => {
    if (isOpen && originalData) {
      const newSelected: any = {};
      RestoreOrder.forEach(key => {
        newSelected[key] = new Set(resourceLists[key].map(item => item.name)); // specific naming key
      });
      setSelectedIds(newSelected);

      // Find first non-empty tab
      const firstPopulated = RestoreOrder.find(key => resourceLists[key].length > 0);
      if (firstPopulated) setActiveTab(firstPopulated);
    }
  }, [isOpen, originalData, resourceLists]);

  const handleToggle = (category: ResourceCategory, name: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev[category]);
      const isSelecting = !newSet.has(name);

      if (isSelecting) {
        newSet.add(name);

        // Auto-select dependencies
        const newState = { ...prev, [category]: newSet };

        const ensure = (cat: ResourceCategory, id: string) => {
          if (resourceLists[cat].some(i => i.name === id)) {
            if (newState[cat] === prev[cat]) newState[cat] = new Set(prev[cat]); // Clone on write
            newState[cat].add(id);
          }
        };

        if (category === 'agents') {
          const asstName = name.split('/agents')[0];
          ensure('assistants', asstName);
          const engName = asstName.split('/assistants')[0];
          ensure('engines', engName);
          const colName = engName.split('/engines')[0];
          ensure('collections', colName);
        } else if (category === 'assistants') {
          const engName = name.split('/assistants')[0];
          ensure('engines', engName);
          const colName = engName.split('/engines')[0];
          ensure('collections', colName);
        } else if (category === 'engines') {
          const colName = name.split('/engines')[0];
          ensure('collections', colName);

          const engineItem = resourceLists.engines.find(e => e.name === name);
          if (engineItem && engineItem.dataStoreIds) {
            engineItem.dataStoreIds.forEach((dsId: string) => {
              const ds = resourceLists.dataStores.find(d => d.name.endsWith('/' + dsId) || d.name === dsId);
              if (ds) {
                if (newState.dataStores === prev.dataStores) newState.dataStores = new Set(prev.dataStores);
                newState.dataStores.add(ds.name);
              }
            });
          }
        }
        return newState;
      } else {
        newSet.delete(name);
        return { ...prev, [category]: newSet };
      }
    });
  };

  const handleSelectAll = (category: ResourceCategory) => {
    setSelectedIds(prev => ({
      ...prev,
      [category]: new Set(resourceLists[category].map(i => i.name))
    }));
  };

  const handleDeselectAll = (category: ResourceCategory) => {
    setSelectedIds(prev => ({
      ...prev,
      [category]: new Set()
    }));
  };

  const getTotalSelected = () => {
    return Object.values(selectedIds).reduce((acc: number, set) => acc + (set as Set<string>).size, 0);
  };

  const handleConfirm = () => {
    const result: any = {};
    RestoreOrder.forEach(key => {
      const list = resourceLists[key];
      const selected = selectedIds[key];
      result[key] = list.filter(item => selected.has(item.name));
    });
    onConfirm(result);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-scaleIn">

        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-slate-800/50 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Icons.LayoutGrid className="text-indigo-400" size={28} />
              {title}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Select resources to restore. Dependencies (parents, linked Data Stores) will be automatically selected.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full">
            <Icons.X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar Tabs */}
          <div className="w-64 bg-slate-950/50 border-r border-white/5 overflow-y-auto p-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Resource Types</h3>
            {RestoreOrder.map(key => {
              const count = resourceLists[key]?.length || 0;
              if (count === 0) return null;

              const selectedCount = selectedIds[key]?.size || 0;
              const isActive = activeTab === key;

              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full flex justify-between items-center px-3 py-3 rounded-lg text-sm transition-all ${isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-medium shadow-md'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                >
                  <span className="capitalize">{DisplayNames[key]}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-indigo-500/30' : 'bg-slate-800'}`}>
                    {selectedCount}/{count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* List View */}
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-900">
            <div className="p-4 border-b border-white/5 bg-slate-800/30 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white capitalize">{DisplayNames[activeTab]}</h3>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => handleSelectAll(activeTab)} size="sm">Select All</Button>
                <Button variant="secondary" onClick={() => handleDeselectAll(activeTab)} size="sm">Clear</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {resourceLists[activeTab].length === 0 ? (
                <div className="text-center py-20 text-slate-500 italic">No items found in this backup.</div>
              ) : (
                resourceLists[activeTab].map(item => (
                  <label
                    key={item.name}
                    onClick={(e) => {
                      e.preventDefault();
                      handleToggle(activeTab, item.name);
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/5 transition-all group"
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds[activeTab].has(item.name)
                      ? 'bg-indigo-500 border-indigo-500'
                      : 'border-slate-600 group-hover:border-slate-500'
                      }`}>
                      {selectedIds[activeTab].has(item.name) && <Icons.Check size={14} className="text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-200 truncate">{item.displayName}</div>
                      <div className="text-xs text-slate-500 font-mono truncate opacity-60 group-hover:opacity-100 transition-opacity">
                        {item.name}
                      </div>
                    </div>

                    {/* Dependencies Hint (Simplified) */}
                    {(activeTab === 'agents' || activeTab === 'assistants') && (
                      <div className="text-xs text-slate-600 bg-slate-950 px-2 py-1 rounded mr-2">
                        {item.name.split('/').slice(-3, -2)[0]}
                      </div>
                    )}

                    {/* Date Hint */}
                    {(item.updateTime || item.createTime) && (
                      <div className="text-xs text-slate-500 font-mono">
                        {new Date(item.updateTime || item.createTime).toLocaleDateString()}
                      </div>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-slate-800/50 flex justify-between items-center">
          <div className="text-sm text-slate-400">
            Total items selected: <span className="text-white font-bold">{getTotalSelected()}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isLoading || getTotalSelected() === 0}
              icon={isLoading ? "Loader2" : "Sparkles"}
            >
              {isLoading ? 'Restoring...' : 'Restore Resources'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoveryRestoreModal;
