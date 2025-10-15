import React from 'react';
import { CloudRunService } from '../../types';

interface ServerListProps {
  services: CloudRunService[];
  onSelectService: (service: CloudRunService) => void;
}

const ServerList: React.FC<ServerListProps> = ({ services, onSelectService }) => {
  const isMcpServerByLabel = (service: CloudRunService): boolean => {
    if (!service.labels) {
      return false;
    }
    for (const [key, value] of Object.entries(service.labels)) {
      if (key.toLowerCase().includes('mcp') || value.toLowerCase().includes('mcp')) {
        return true;
      }
    }
    return false;
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Cloud Run Services</h2>
      </div>
      {services.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No Cloud Run services found for the selected project and region. Click "Scan for Services" to begin.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Service Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Label Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">URL</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Region</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Last Updated</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {services.map((service) => {
                const serviceName = service.name.split('/').pop() || '';
                const isMcpByLabel = isMcpServerByLabel(service);

                return (
                  <tr key={service.name} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center">
                       <span className={`h-2.5 w-2.5 rounded-full mr-3 shrink-0 ${isMcpByLabel ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                       {serviceName}
                    </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {isMcpByLabel ? (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-500 text-white">MCP Server</span>
                      ) : (
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-600 text-gray-300">Not MCP</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-400">
                      <a href={service.uri} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {service.uri}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{service.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(service.updateTime).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => onSelectService(service)} className="font-semibold text-blue-400 hover:text-blue-300">
                            View
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ServerList;