import React from 'react';
import { Page } from '../types';

interface BreadcrumbsProps {
  currentPage: Page;
  context?: any;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentPage, context }) => {
  const items = [
    { label: 'Agent Space', active: false },
    { label: currentPage, active: !context }
  ];

  if (context) {
    if (context.displayName) {
        items.push({ label: context.displayName, active: true });
    } else if (context.name) {
        items.push({ label: context.name.split('/').pop(), active: true });
    }
  }

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="inline-flex items-center space-x-1 md:space-x-3">
        {items.map((item, index) => (
          <li key={index} className="inline-flex items-center">
            {index > 0 && (
               <svg className="w-4 h-4 text-gray-400 mx-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
            )}
            <span className={`inline-flex items-center text-sm font-medium ${item.active ? 'text-white' : 'text-gray-400'}`}>
              {item.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
