import React, { useState, useEffect } from 'react';
import * as api from '../../services/apiService';
import { Authorization, Config } from '../../types';

interface AuthFormProps {
  config: Config;
  onSuccess: () => void;
  onCancel: () => void;
  authToEdit?: Authorization | null;
}

const initialFormData = {
    authId: 'your-auth-id',
    oauthClientId: 'your-oauth-client-id',
    oauthClientSecret: '', // Start empty
    scopes: 'https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/gmail.send',
    oauthTokenUri: 'https://oauth2.googleapis.com/token',
    redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
};

const FormField: React.FC<{ name: keyof typeof initialFormData; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; type?: string; helpText?: string; disabled?: boolean; }> = 
({ name, label, value, onChange, required = false, type = 'text', helpText, disabled = false }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-300">{label}</label>
        <input type={type} name={name} id={name} value={value} onChange={onChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white disabled:bg-gray-800 disabled:text-gray-400" required={required} disabled={disabled} />
        {helpText && <p className="mt-1 text-xs text-gray-400">{helpText}</p>}
    </div>
);

const AuthForm: React.FC<AuthFormProps> = ({ config, onSuccess, onCancel, authToEdit }) => {
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for cURL command preview
  const [curlCommand, setCurlCommand] = useState('');
  const [copySuccessCurl, setCopySuccessCurl] = useState(false);

  useEffect(() => {
    if (authToEdit) {
        const authUri = authToEdit.serverSideOauth2.authorizationUri;
        let scopes = '';
        let redirectUri = '';
        try {
            const url = new URL(authUri);
            scopes = url.searchParams.get('scope')?.split(' ').join(',') || '';
            redirectUri = url.searchParams.get('redirect_uri') || '';
        } catch(e) {
            console.error("Could not parse authorization URI", authUri);
        }

        setFormData({
            authId: authToEdit.name.split('/').pop() || '',
            oauthClientId: authToEdit.serverSideOauth2.clientId,
            oauthClientSecret: '', // Secret is write-only, must be re-entered to update
            scopes,
            oauthTokenUri: authToEdit.serverSideOauth2.tokenUri,
            redirectUri,
        });
    } else {
        setFormData(initialFormData);
    }
  }, [authToEdit]);
  
  // Effect to generate the cURL command preview for both create and update
  useEffect(() => {
    const { projectId } = config;
    if (!projectId) {
        setCurlCommand('Project ID must be set.');
        return;
    }

    const authorizationUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${formData.oauthClientId}&redirect_uri=${formData.redirectUri}&scope=${encodeURIComponent(formData.scopes.split(',').join(' '))}&response_type=code&access_type=offline&prompt=consent`;

    if (authToEdit) {
        // --- UPDATE (PATCH) LOGIC ---
        const updateMask: string[] = [];
        const payload: any = {
            serverSideOauth2: {}
        };

        if (formData.oauthClientId !== authToEdit.serverSideOauth2.clientId) {
            updateMask.push('serverSideOauth2.clientId');
            payload.serverSideOauth2.clientId = formData.oauthClientId;
        }
        if (authorizationUrl !== authToEdit.serverSideOauth2.authorizationUri) {
            updateMask.push('serverSideOauth2.authorizationUri');
            payload.serverSideOauth2.authorizationUri = authorizationUrl;
        }
        if (formData.oauthTokenUri !== authToEdit.serverSideOauth2.tokenUri) {
            updateMask.push('serverSideOauth2.tokenUri');
            payload.serverSideOauth2.tokenUri = formData.oauthTokenUri;
        }
        if (formData.oauthClientSecret) {
            updateMask.push('serverSideOauth2.clientSecret');
            payload.serverSideOauth2.clientSecret = formData.oauthClientSecret;
        }

        if (updateMask.length === 0) {
            setCurlCommand('# No changes detected. Modify the form to see the update command.');
            return;
        }

        if (Object.keys(payload.serverSideOauth2).length === 0) {
            delete payload.serverSideOauth2;
        }

        const payloadString = JSON.stringify(payload, null, 2);
        const url = `https://discoveryengine.googleapis.com/v1alpha/${authToEdit.name}?updateMask=${updateMask.join(',')}`;

        const command = `curl -X PATCH \\
     -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
     -H "Content-Type: application/json" \\
     -H "X-Goog-User-Project: ${projectId}" \\
     -d '${payloadString}' \\
     "${url}"`;
        setCurlCommand(command);

    } else {
        // --- CREATE (POST) LOGIC ---
        const finalAuthId = formData.authId.split('/').pop()?.trim() || '';
        if (!finalAuthId) {
            setCurlCommand('Authorization ID is required.');
            return;
        }
        
        const createPayload: any = {
            serverSideOauth2: {
                clientId: formData.oauthClientId,
                clientSecret: formData.oauthClientSecret,
                authorizationUri: authorizationUrl,
                tokenUri: formData.oauthTokenUri,
            },
        };

        const payloadString = JSON.stringify(createPayload, null, 2);
        const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/global/authorizations?authorizationId=${finalAuthId}`;

        const command = `curl -X POST \\
     -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
     -H "Content-Type: application/json" \\
     -H "X-Goog-User-Project: ${projectId}" \\
     -d '${payloadString}' \\
     "${url}"`;
        setCurlCommand(command);
    }
  }, [formData, authToEdit, config]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    const authorizationUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${formData.oauthClientId}&redirect_uri=${formData.redirectUri}&scope=${encodeURIComponent(formData.scopes.split(',').join(' '))}&response_type=code&access_type=offline&prompt=consent`;
    
    const payload = {
      serverSideOauth2: {
        clientId: formData.oauthClientId,
        clientSecret: formData.oauthClientSecret,
        authorizationUri: authorizationUrl,
        tokenUri: formData.oauthTokenUri,
      },
    };

    // Only include clientSecret if user provided a new one
    if (!formData.oauthClientSecret) {
        delete payload.serverSideOauth2.clientSecret;
    }

    try {
      if (authToEdit) {
        // Build update mask dynamically for PATCH using correct camelCase paths
        const updateMask: string[] = [];
        if (formData.oauthClientId !== authToEdit.serverSideOauth2.clientId) updateMask.push('serverSideOauth2.clientId');
        if (authorizationUrl !== authToEdit.serverSideOauth2.authorizationUri) updateMask.push('serverSideOauth2.authorizationUri');
        if (formData.oauthTokenUri !== authToEdit.serverSideOauth2.tokenUri) updateMask.push('serverSideOauth2.tokenUri');
        if (formData.oauthClientSecret) updateMask.push('serverSideOauth2.clientSecret');
        
        if (updateMask.length > 0) {
            await api.updateAuthorization(authToEdit.name, payload, updateMask, config);
        }
      } else {
        // Sanitize the authId to prevent sending a full resource path
        const finalAuthId = formData.authId.split('/').pop() || '';
        if (!finalAuthId) {
            throw new Error("Authorization ID cannot be empty.");
        }
        await api.createAuthorization(finalAuthId, payload, config);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save authorization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCurlCommand = () => {
    navigator.clipboard.writeText(curlCommand).then(() => {
        setCopySuccessCurl(true);
        setTimeout(() => setCopySuccessCurl(false), 2000);
    });
  };
  
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-white">{authToEdit ? 'Update Authorization' : 'Create New Authorization'}</h2>
            <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white">&larr; Back to list</button>
        </div>
      
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Column 1: The Form */}
            <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
                <FormField name="authId" label="Authorization ID" value={formData.authId} onChange={handleChange} required disabled={!!authToEdit} helpText={!authToEdit ? 'Enter a unique ID or paste the full resource name.' : ''} />
                <FormField name="oauthClientId" label="OAuth 2.0 Client ID" value={formData.oauthClientId} onChange={handleChange} required />
                <FormField name="oauthClientSecret" label="OAuth 2.0 Client Secret" value={formData.oauthClientSecret} onChange={handleChange} required={!authToEdit} type="password" helpText={authToEdit ? 'Leave blank to keep existing secret. Enter a new value to update.' : ''} />
                <FormField name="scopes" label="OAuth 2.0 Scopes" value={formData.scopes} onChange={handleChange} required helpText="Comma-separated list of scopes." />
                <FormField name="oauthTokenUri" label="OAuth Token URI" value={formData.oauthTokenUri} onChange={handleChange} />
                <FormField name="redirectUri" label="OAuth Redirect URI" value={formData.redirectUri} onChange={handleChange} />
            </form>

            {/* Column 2: The Preview */}
            <div>
                <h3 className="text-xl font-semibold text-white">cURL Command Preview</h3>
                <p className="text-sm text-gray-400 mt-1 mb-2">
                    {authToEdit
                        ? "This command reflects changes made in the form for updating the authorization."
                        : "This command reflects the current form settings for creating a new authorization."}
                </p>
                <div className="bg-gray-900 rounded-lg p-4 relative" style={{ maxHeight: 'calc(100vh - 25rem)', overflowY: 'auto' }}>
                    <button
                        onClick={handleCopyCurlCommand}
                        className="absolute top-3 right-3 px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 z-10"
                    >
                        {copySuccessCurl ? 'Copied!' : 'Copy'}
                    </button>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                        <code>
                            {curlCommand}
                        </code>
                    </pre>
                </div>
            </div>
        </div>

        {/* Buttons and Error outside the grid, at the bottom of the component */}
        <div className="mt-6">
            {error && <p className="text-red-400 mb-4 text-center">{error}</p>}
            <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
                <button type="submit" form="auth-form" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800">
                    {isSubmitting ? 'Saving...' : authToEdit ? 'Update' : 'Create'}
                </button>
            </div>
        </div>
    </div>
  );
};

export default AuthForm;