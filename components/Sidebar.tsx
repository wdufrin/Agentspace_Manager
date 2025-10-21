
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
    <span className="ml-3 flex items-center gap-2">
      <span>{page}</span>
    </span>
  </button>
);

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  const mainFeatures = [
    { page: Page.AGENTS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg> },
    { page: Page.AUTHORIZATIONS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a4 4 0 100 8 4 4 0 000-8z" clipRule="evenodd" /></svg> },
    { page: Page.AGENT_ENGINES, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg> },
    { page: Page.DATA_STORES, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" /><path d="M3 8a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" /><path d="M3 12a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" /></svg> },
    { page: Page.MODEL_ARMOR, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2L3 5v6c0 3.55 3.14 6.84 7 7.93 3.86-1.09 7-4.38 7-7.93V5l-7-3z" /></svg> },
    { page: Page.BACKUP_RECOVERY, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg> },
  ];

  const betaFeatures = [
    { page: Page.ARCHITECTURE, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM4 4a1 1 0 00-1 1v1a1 1 0 002 0V5a1 1 0 00-1-1zM16 4a1 1 0 00-1 1v1a1 1 0 002 0V5a1 1 0 00-1-1zM3 10a1 1 0 011-1h1a1 1 0 110 2H4a1 1 0 01-1-1zM15 10a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM10 15a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM4 15a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zM10 9a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1z" clipRule="evenodd" /></svg> },
    { page: Page.CHAT, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" /></svg> },
    { page: Page.AGENT_BUILDER, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.494 3.132a1 1 0 00-1.414 0l-1.88 1.88a1 1 0 000 1.414l.707.707a1 1 0 001.414 0l.172-.172a.5.5 0 01.707 0l1.414 1.414a.5.5 0 010 .707l-.172.172a1 1 0 000 1.414l.707.707a1 1 0 001.414 0l1.88-1.88a1 1 0 000-1.414l-4.243-4.243zM4.707 10.293a1 1 0 00-1.414 1.414l3.536 3.536a1 1 0 001.414 0l.707-.707a1 1 0 00-1.414-1.414l-.353.354-2.121-2.121.353-.354a1 1 0 00-1.414-1.414l-.707.707z" clipRule="evenodd" /><path d="M13.293 4.293a1 1 0 010 1.414L11 8a1 1 0 01-1.414-1.414L11.879 4.3a1 1 0 011.414-.007z" /></svg> },
    { page: Page.A2A_FUNCTIONS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 01-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg> },
    { page: Page.AGENT_REGISTRATION, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a3 3 0 10-6 0v4a1 1 0 102 0V7a1 1 0 112 0v4a3 3 0 11-6 0V7a5 5 0 0110 0v4a5 5 0 01-10 0V7a3 3 0 00-3-3z" clipRule="evenodd" /></svg> },
    { page: Page.A2A_TESTER, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1 1 0 011 1v1h-2V4a1 1 0 011-1zM9 6h2a1 1 0 011 1v1h1a1 1 0 011 1v2a1 1 0 01-1 1h-1v1a1 1 0 01-1 1H9a1 1 0 01-1-1v-1H7a1 1 0 01-1-1V9a1 1 0 011-1h1V7a1 1 0 011-1z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" clipRule="evenodd" /></svg> },
    { page: Page.MCP_SERVERS, icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V5zM3 13a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM6 6H4v1h2V6zm0 8H4v1h2v-1z" /></svg> },
  ];

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col">
      <div className="flex items-center mb-8">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span className="ml-2 text-2xl font-semibold text-white">Gemini Enterprise</span>
      </div>
      
      <div className="flex-1 flex flex-col">
          <nav className="flex-1 space-y-2">
            {mainFeatures.map(item => (
              <NavItem 
                key={item.page}
                page={item.page} 
                currentPage={currentPage} 
                setCurrentPage={setCurrentPage}
                icon={item.icon}
              />
            ))}
          </nav>
          
          {/* --- BETA Section at the bottom --- */}
          <div className="pt-4 mt-auto">
              <div className="pt-4 border-t border-gray-700">
                  <h3 className="px-4 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Beta Features
                  </h3>
                  <div className="space-y-2">
                    {betaFeatures.map(item => (
                      <NavItem 
                        key={item.page}
                        page={item.page} 
                        currentPage={currentPage} 
                        setCurrentPage={setCurrentPage}
                        icon={item.icon}
                      />
                    ))}
                  </div>
              </div>
          </div>
      </div>
    </aside>
  );
};

export default Sidebar;
