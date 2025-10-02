
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
  
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6">{authToEdit ? 'Update Authorization' : 'Create New Authorization'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField name="authId" label="Authorization ID" value={formData.authId} onChange={handleChange} required disabled={!!authToEdit} helpText={!authToEdit ? 'Enter a unique ID or paste the full resource name.' : ''} />
        <FormField name="oauthClientId" label="OAuth 2.0 Client ID" value={formData.oauthClientId} onChange={handleChange} required />
        <FormField name="oauthClientSecret" label="OAuth 2.0 Client Secret" value={formData.oauthClientSecret} onChange={handleChange} required={!authToEdit} type="password" helpText={authToEdit ? 'Leave blank to keep existing secret. Enter a new value to update.' : ''} />
        <FormField name="scopes" label="OAuth 2.0 Scopes" value={formData.scopes} onChange={handleChange} required helpText="Comma-separated list of scopes." />
        <FormField name="oauthTokenUri" label="OAuth Token URI" value={formData.oauthTokenUri} onChange={handleChange} />
        <FormField name="redirectUri" label="OAuth Redirect URI" value={formData.redirectUri} onChange={handleChange} />
        
        {error && <p className="text-red-400">{error}</p>}
        
        <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
          <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800">
            {isSubmitting ? 'Saving...' : authToEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AuthForm;
