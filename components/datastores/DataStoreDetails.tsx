import React, { useState, useEffect, useCallback } from 'react';
import { Config, DataStore, Document, GcsBucket, GcsObject } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import DocumentList from './DocumentList';
import DocumentDetails from './DocumentDetails';

interface DataStoreDetailsProps {
    dataStore: DataStore;
    config: Config;
    onBack: () => void;
    onDelete: (dataStore: DataStore) => void;
    onEdit: (dataStore: DataStore) => void;
    isDeleting: boolean;
}

const DetailItem: React.FC<{ label: string; value: string | string[] | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded">
            {Array.isArray(value) ? value.join(', ') : (value || 'Not set')}
        </dd>
    </div>
);

const DataStoreDetails: React.FC<DataStoreDetailsProps> = ({ dataStore, config, onBack, onDelete, onEdit, isDeleting }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);
    const [docsError, setDocsError] = useState<string | null>(null);

    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
    const [isFetchingDocDetails, setIsFetchingDocDetails] = useState(false);
    const [docDetailsError, setDocDetailsError] = useState<string | null>(null);
    
    // State for document import
    const [importMode, setImportMode] = useState<'select' | 'upload'>('select');
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [bucketError, setBucketError] = useState<string | null>(null);
    const [selectedBucket, setSelectedBucket] = useState('');
    const [gcsPrefix, setGcsPrefix] = useState('');
    
    const [gcsObjects, setGcsObjects] = useState<GcsObject[]>([]);
    const [isLoadingGcsObjects, setIsLoadingGcsObjects] = useState(false);
    const [gcsObjectsError, setGcsObjectsError] = useState<string | null>(null);
    
    const [selectedGcsUri, setSelectedGcsUri] = useState<string>('');
    const [localFileForUpload, setLocalFileForUpload] = useState<File | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadLogs, setUploadLogs] = useState<string[]>([]);

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
    
    // Reset state when bucket changes
    useEffect(() => {
        setGcsObjects([]);
        setGcsObjectsError(null);
        setSelectedGcsUri('');
        setGcsPrefix('');
    }, [selectedBucket]);

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

    const addUploadLog = (message: string) => {
      setUploadLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    };
  
    const handleLoadBuckets = useCallback(async () => {
      setIsLoadingBuckets(true);
      setBucketError(null);
      try {
        const response = await api.listBuckets(config.projectId);
        setBuckets(response.items || []);
      } catch (err: any) {
        setBucketError(err.message || 'Failed to load buckets.');
      } finally {
        setIsLoadingBuckets(false);
      }
    }, [config.projectId]);
  
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        setLocalFileForUpload(e.target.files[0]);
      } else {
        setLocalFileForUpload(null);
      }
    };
    
    const handleLoadGcsObjects = async () => {
        if (!selectedBucket) return;
        setIsLoadingGcsObjects(true);
        setGcsObjectsError(null);
        setGcsObjects([]);
        setSelectedGcsUri('');
        try {
            const response = await api.listGcsObjects(selectedBucket, gcsPrefix, config.projectId);
            const compatibleFiles = (response.items || []).filter(item => 
                /\.(xlsx|docx|pptx)$/i.test(item.name)
            );
            setGcsObjects(compatibleFiles);
            if (compatibleFiles.length === 0) {
                setGcsObjectsError('No compatible files (.xlsx, .docx, .pptx) found at this path.');
            }
        } catch (err: any) {
            setGcsObjectsError(err.message || 'Failed to list objects in bucket.');
        } finally {
            setIsLoadingGcsObjects(false);
        }
    };

    const handleUploadAndImport = async () => {
      if (!selectedBucket || (importMode === 'upload' && !localFileForUpload) || (importMode === 'select' && !selectedGcsUri)) {
        addUploadLog("ERROR: A bucket and a file must be selected.");
        return;
      }
      
      setIsUploading(true);
      setUploadLogs([]);
      
      let gcsUri = '';

      try {
        if (importMode === 'upload' && localFileForUpload) {
            addUploadLog(`Starting upload of "${localFileForUpload.name}"...`);
            addUploadLog(`  - Uploading file to GCS bucket: gs://${selectedBucket}`);
            await api.uploadFileToGcs(selectedBucket, localFileForUpload.name, localFileForUpload, config.projectId);
            addUploadLog(`  - GCS upload successful.`);
            gcsUri = `gs://${selectedBucket}/${localFileForUpload.name}`;
        } else {
            gcsUri = selectedGcsUri;
            addUploadLog(`File already in GCS. Starting import directly.`);
        }
        
        addUploadLog(`  - Starting import from GCS URI: ${gcsUri}`);
        
        const operation = await api.importDocuments(dataStore.name, [gcsUri], selectedBucket, config);
        addUploadLog(`  - Import operation started: ${operation.name}`);
        
        let currentOperation = operation;
        while (!currentOperation.done) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          currentOperation = await api.getDiscoveryOperation(operation.name, config);
          addUploadLog('    - Polling operation status...');
        }

        if (currentOperation.error) {
          throw new Error(`Import failed: ${currentOperation.error.message}`);
        }
        
        addUploadLog("  - Import operation completed successfully!");
        addUploadLog("Refreshing document list...");
        await fetchDocuments();
        
      } catch (err: any) {
        addUploadLog(`FATAL ERROR: ${err.message}`);
      } finally {
        setIsUploading(false);
      }
    };
    
    const isImportDisabled = isUploading || !selectedBucket || (importMode === 'upload' && !localFileForUpload) || (importMode === 'select' && !selectedGcsUri);


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
            
            <div className="mt-8 flex flex-wrap gap-4 border-t border-gray-700 pt-6">
                <button
                    onClick={() => onEdit(dataStore)}
                    disabled={isDeleting}
                    className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800"
                >
                    Edit
                </button>
                <button
                    onClick={() => onDelete(dataStore)}
                    disabled={isDeleting}
                    className="px-5 py-2.5 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800"
                >
                    {isDeleting ? 'Deleting...' : 'Delete Data Store'}
                </button>
            </div>

            <div className="mt-6 border-t border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-white">Documents</h3>
                
                 <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 my-4 space-y-4">
                    <h4 className="font-semibold text-white">Import New Document</h4>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">Step 1: Select GCS Bucket for Staging</label>
                        <div className="flex items-center gap-2">
                            <select 
                                value={selectedBucket} 
                                onChange={(e) => setSelectedBucket(e.target.value)} 
                                className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]" 
                                disabled={isUploading || isLoadingBuckets}
                            >
                                <option value="">{isLoadingBuckets ? 'Loading...' : '-- Select a Bucket --'}</option>
                                {buckets.map(bucket => <option key={bucket.id} value={bucket.name}>{bucket.name}</option>)}
                            </select>
                            <button onClick={handleLoadBuckets} disabled={isLoadingBuckets || isUploading} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 h-[38px] shrink-0">
                                {isLoadingBuckets ? '...' : 'Load'}
                            </button>
                        </div>
                        {bucketError && <p className="text-xs text-red-400 mt-1">{bucketError}</p>}
                    </div>
                    
                    {selectedBucket && (
                         <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-400">Step 2: Select or Upload Document</label>
                            <div className="flex border-b border-gray-600">
                                <button onClick={() => setImportMode('select')} className={`px-4 py-2 text-sm font-medium transition-colors ${importMode === 'select' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>Select Existing File</button>
                                <button onClick={() => setImportMode('upload')} className={`px-4 py-2 text-sm font-medium transition-colors ${importMode === 'upload' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}>Upload New File</button>
                            </div>
                            <div className="pt-2">
                                {importMode === 'upload' && (
                                     <input
                                        id="file-upload"
                                        type="file"
                                        accept=".xlsx,.docx,.pptx"
                                        onChange={handleFileChange}
                                        disabled={isUploading}
                                        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 disabled:opacity-50"
                                    />
                                )}
                                {importMode === 'select' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                value={gcsPrefix} 
                                                onChange={(e) => setGcsPrefix(e.target.value)}
                                                placeholder="Folder path (optional, e.g., my-docs/)"
                                                className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]"
                                                disabled={isUploading || isLoadingGcsObjects}
                                            />
                                            <button onClick={handleLoadGcsObjects} disabled={isLoadingGcsObjects || isUploading} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 h-[38px] shrink-0">
                                                {isLoadingGcsObjects ? '...' : 'Load Files'}
                                            </button>
                                        </div>
                                        {(gcsObjects.length > 0 || gcsObjectsError) && (
                                             <select 
                                                value={selectedGcsUri}
                                                onChange={(e) => setSelectedGcsUri(e.target.value)}
                                                className="w-full bg-gray-700 border-gray-600 rounded-md text-sm p-2 h-[38px]"
                                                disabled={isUploading || isLoadingGcsObjects}
                                             >
                                                <option value="">-- Select a file from the bucket --</option>
                                                {gcsObjects.map(obj => <option key={obj.name} value={`gs://${obj.bucket}/${obj.name}`}>{obj.name.substring(gcsPrefix.length)}</option>)}
                                             </select>
                                        )}
                                        {gcsObjectsError && <p className="text-xs text-red-400 mt-1">{gcsObjectsError}</p>}
                                    </div>
                                )}
                            </div>
                         </div>
                    )}

                    <button 
                        onClick={handleUploadAndImport} 
                        disabled={isImportDisabled}
                        className="w-full px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-md hover:bg-teal-700 disabled:bg-gray-500 flex items-center justify-center"
                    >
                        {isUploading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>}
                        {isUploading ? 'Importing...' : (importMode === 'upload' ? 'Upload & Import New File' : 'Import Selected File')}
                    </button>
                    {uploadLogs.length > 0 && (
                        <div className="mt-2">
                            <h4 className="text-sm font-semibold text-gray-300">Import Log</h4>
                            <pre className="bg-gray-800 text-xs text-gray-300 p-2 mt-1 rounded-md h-24 overflow-y-auto font-mono">
                                {uploadLogs.join('\n')}
                            </pre>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
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
        </div>
    );
};

export default DataStoreDetails;