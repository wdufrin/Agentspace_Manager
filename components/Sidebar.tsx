import React from 'react';
import { Page } from '../types';

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

const NavItem: React.FC<{
  page: Page;
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  // FIX: Replaced JSX.Element with React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
  icon: React.ReactElement;
}> = ({ page, currentPage, setCurrentPage, icon }) => (
  <button
    onClick={() => setCurrentPage(page)}
    className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${
      currentPage === page
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
    }`}
  >
    {icon}
    <span className="ml-3">{page}</span>
  </button>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col">
      <div className="flex items-center mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span className="ml-2 text-2xl font-semibold text-white">Agentspace</span>
      </div>
      <nav className="flex-1 space-y-2">
        <NavItem 
          page={Page.AGENTS} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>}
        />
        <NavItem 
          page={Page.AUTHORIZATIONS} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" /></svg>}
        />
         <NavItem 
          page={Page.AGENT_ENGINES} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>}
        />
        <NavItem 
          page={Page.AGENT_BUILDER} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.494 3.132a1 1 0 00-1.414 0l-1.88 1.88a1 1 0 000 1.414l.707.707a1 1 0 001.414 0l.172-.172a.5.5 0 01.707 0l1.414 1.414a.5.5 0 010 .707l-.172.172a1 1 0 000 1.414l.707.707a1 1 0 001.414 0l1.88-1.88a1 1 0 000-1.414l-4.243-4.243zM4.707 10.293a1 1 0 00-1.414 1.414l3.536 3.536a1 1 0 001.414 0l.707-.707a1 1 0 00-1.414-1.414l-.353.354-2.121-2.121.353-.354a1 1 0 00-1.414-1.414l-.707.707z" clipRule="evenodd" /><path d="M13.293 4.293a1 1 0 010 1.414L11 8a1 1 0 01-1.414-1.414L11.879 4.3a1 1 0 011.414-.007z" /></svg>}
        />
        <NavItem 
          page={Page.DATA_STORES} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" /><path d="M3 8a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" /><path d="M3 12a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" /></svg>}
        />
        <NavItem 
          page={Page.MCP_SERVERS} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V5zM3 13a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM6 6H4v1h2V6zm0 8H4v1h2v-1z" /></svg>}
        />
        <NavItem
          page={Page.MODEL_ARMOR}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2L3 5v6c0 3.55 3.14 6.84 7 7.93 3.86-1.09 7-4.38 7-7.93V5l-7-3z" /></svg>}
        />
         <NavItem 
          page={Page.BACKUP_RECOVERY} 
          currentPage={currentPage} 
          setCurrentPage={setCurrentPage}
          icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg>}
        />
      </nav>
    </aside>
  );
};

export default Sidebar;