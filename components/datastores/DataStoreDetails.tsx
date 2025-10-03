
import React, { useState, useEffect, useCallback } from 'react';
import { Config, DataStore, Document } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import DocumentList from './DocumentList';
import DocumentDetails from './DocumentDetails';

interface DataStoreDetailsProps {
    dataStore: DataStore;
    config: Config;
    onBack: () => void;
}

const DetailItem: React.FC<{ label: string; value: string | string[] | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded">
            {Array.isArray(value) ? value.join(', ') : (value || 'Not set')}
        </dd>
    </div>
);

const DataStoreDetails: React.FC<DataStoreDetailsProps> = ({ dataStore, config, onBack }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);
    const [docsError, setDocsError] = useState<string | null>(null);

    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
    const [isFetchingDocDetails, setIsFetchingDocDetails] = useState(false);
    const [docDetailsError, setDocDetailsError] = useState<string | null>(null);


    const dataStoreId = dataStore.name.split('/').pop() || '';

    const fetchDocuments = useCallback(async () => {
        setIsLoadingDocs(true);
        setDocsError(null);
        try {
            const response = await api.listDocuments(dataStore.name, config);
            setDocuments(response.documents || []);
        } catch (err: any) {
            setDocsError(err.message || 'Failed to fetch documents.');
        } finally {
            setIsLoadingDocs(false);
        }
    }, [dataStore.name, config]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const handleSelectDocument = useCallback(async (document: Document) => {
        if (selectedDocument?.name === document.name) {
            setSelectedDocument(null);
            return;
        }

        setIsFetchingDocDetails(true);
        setDocDetailsError(null);
        setSelectedDocument(null);
        try {
            const fullDocumentDetails = await api.getDocument(document.name, config);
            setSelectedDocument(fullDocumentDetails);
        } catch (err: any) {
            setDocDetailsError(err.message || 'Failed to fetch document details.');
        } finally {
            setIsFetchingDocDetails(false);
        }
    }, [config, selectedDocument?.name]);


    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-white">
                        {dataStore.displayName}
                    </h2>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back to list</button>
            </div>

            <dl className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="Full Resource Name" value={dataStore.name} />
                <DetailItem label="Data Store ID" value={dataStoreId} />
                <DetailItem label="Industry Vertical" value={dataStore.industryVertical} />
                <DetailItem label="Solution Types" value={dataStore.solutionTypes} />
                <DetailItem label="Content Config" value={dataStore.contentConfig} />
            </dl>
            
            <div className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h3 className="text-lg font-semibold text-white mb-2">Documents</h3>
                    {isLoadingDocs ? <Spinner /> : 
                        docsError ? <p className="text-red-400 mt-2">{docsError}</p> :
                        <DocumentList 
                            documents={documents} 
                            onSelectDocument={handleSelectDocument}
                            selectedDocumentName={selectedDocument?.name}
                        />
                    }
                </div>
                <div>
                    {isFetchingDocDetails && <div className="flex justify-center items-center h-full"><Spinner /></div>}
                    {docDetailsError && <div className="text-center text-red-400 p-4 mt-4 bg-red-900/20 rounded-lg">{docDetailsError}</div>}
                    
                    {selectedDocument && !isFetchingDocDetails && (
                        <DocumentDetails document={selectedDocument} />
                    )}

                    {!selectedDocument && !isFetchingDocDetails && !docDetailsError && (
                         <div className="bg-gray-900 rounded-lg shadow-inner border border-gray-700 h-full flex items-center justify-center min-h-[200px]">
                             <p className="text-gray-500 text-sm">Select a document to view its details.</p>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataStoreDetails;
