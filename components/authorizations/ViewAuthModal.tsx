import React from 'react';
import { Authorization } from '../../types';

interface ViewAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorization: Authorization | null;
}

const ViewAuthModal: React.FC<ViewAuthModalProps> = ({ isOpen, onClose, authorization }) => {
  if (!isOpen || !authorization) return null;

  const authId = authorization.name.split('/').pop() || '';
  const { serverSideOauth2 } = authorization;

  // Attempt to extract Tenant ID if it's an Azure/Entra ID URI
  // Pattern: https://login.microsoftonline.com/{tenant_id}/...
  let tenantId: string | null = null;
  if (serverSideOauth2?.authorizationUri && serverSideOauth2.authorizationUri.includes('login.microsoftonline.com')) {
    const match = serverSideOauth2.authorizationUri.match(new RegExp('login\\.microsoftonline\\.com/([^/]+)/'));
    if (match && match[1]) {
      tenantId = match[1];
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">

        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        {/* Modal panel */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full border border-gray-700">

          <div className="bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-white" id="modal-title">
                  Authorization Details
                </h3>
                <div className="mt-4 space-y-4">

                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Name (ID)</label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                      <input
                        type="text"
                        readOnly
                        value={authId}
                        className="flex-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {serverSideOauth2 && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Client ID</label>
                        <div className="mt-1">
                          <input
                            type="text"
                            readOnly
                            value={serverSideOauth2.clientId}
                            className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                          />
                        </div>
                      </div>

                      {tenantId && (
                        <div className="bg-blue-900/20 border border-blue-800/50 rounded-md p-3">
                          <label className="block text-xs font-bold text-blue-300 uppercase tracking-wider">Tenant ID (Entra ID)</label>
                          <div className="mt-1 flex items-center">
                            <input
                              type="text"
                              readOnly
                              value={tenantId}
                              className="block w-full px-3 py-2 bg-gray-800 border border-blue-700 rounded-md text-sm text-blue-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                            />
                          </div>
                        </div>
                      )}

                      <div className="hidden"> {/* Hidden because we don't have the secret anyway */}
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Client Secret</label>
                        <div className="mt-1">
                          <input
                            type="password"
                            readOnly
                            value="****************"
                            className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-500 italic cursor-not-allowed"
                            disabled
                          />
                          <p className="mt-1 text-xs text-gray-500">Secret is hidden for security.</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Authorization URI</label>
                        <div className="mt-1">
                          <input
                            type="text"
                            readOnly
                            value={serverSideOauth2.authorizationUri}
                            className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Token URI</label>
                        <div className="mt-1">
                          <input
                            type="text"
                            readOnly
                            value={serverSideOauth2.tokenUri}
                            className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {!serverSideOauth2 && (
                    <div className="p-4 bg-yellow-900/30 text-yellow-200 rounded-md text-sm border border-yellow-700/50">
                      No OAuth2 configuration found for this authorization.
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-700">
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Full Resource Name</label>
                    <code className="block w-full text-left px-3 py-2 bg-gray-900 rounded-md text-xs text-gray-400 font-mono break-all leading-relaxed">
                      {authorization.name}
                    </code>
                  </div>

                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-700">
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-600 shadow-sm px-4 py-2 bg-gray-800 text-base font-medium text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewAuthModal;
