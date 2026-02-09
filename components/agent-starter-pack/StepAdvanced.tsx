import React from 'react';

interface StepAdvancedProps {
    includeFrontend: boolean;
    setIncludeFrontend: (val: boolean) => void;
    enableAnalytics: boolean;
    setEnableAnalytics: (val: boolean) => void;
    enableRedis: boolean;
    setEnableRedis: (val: boolean) => void;
    gcsBucket: string;
    setGcsBucket: (val: string) => void;
    dataStoreId: string;
    setDataStoreId: (val: string) => void;
}

const StepAdvanced: React.FC<StepAdvancedProps> = ({
    includeFrontend, setIncludeFrontend,
    enableAnalytics, setEnableAnalytics,
    enableRedis, setEnableRedis,
    gcsBucket, setGcsBucket,
    dataStoreId, setDataStoreId
}) => {
    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-md">
                <h3 className="text-lg font-semibold text-white mb-4">Advanced Capabilities</h3>
                <p className="text-sm text-gray-400 mb-6">Enhance your agent with additional features. These will provision extra infrastructure.</p>

                <div className="space-y-4">
                    {/* Include Frontend */}
                    <label className="flex items-start gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700 cursor-pointer hover:border-teal-500/50 transition-colors">
                        <input
                            type="checkbox"
                            className="mt-1 w-5 h-5 bg-gray-800 border-gray-600 text-teal-600 focus:ring-teal-500 rounded"
                            checked={includeFrontend}
                            onChange={(e) => setIncludeFrontend(e.target.checked)}
                        />
                        <div>
                            <div className="font-medium text-gray-200">Include Frontend UI</div>
                            <div className="text-xs text-gray-500 mt-1">Generates a sample React frontend and provisions a Cloud Storage bucket for hosting.</div>
                        </div>
                    </label>

                    {/* Enable Analytics */}
                    <label className="flex items-start gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700 cursor-pointer hover:border-teal-500/50 transition-colors">
                        <input
                            type="checkbox"
                            className="mt-1 w-5 h-5 bg-gray-800 border-gray-600 text-teal-600 focus:ring-teal-500 rounded"
                            checked={enableAnalytics}
                            onChange={(e) => setEnableAnalytics(e.target.checked)}
                        />
                        <div>
                            <div className="font-medium text-gray-200">Enable Analytics (BigQuery)</div>
                            <div className="text-xs text-gray-500 mt-1">Streams agent interactions to BigQuery for analysis. Provisions a Dataset and Table.</div>
                        </div>
                    </label>

                    {/* Enable Redis */}
                    <label className="flex items-start gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700 cursor-pointer hover:border-teal-500/50 transition-colors">
                        <input
                            type="checkbox"
                            className="mt-1 w-5 h-5 bg-gray-800 border-gray-600 text-teal-600 focus:ring-teal-500 rounded"
                            checked={enableRedis}
                            onChange={(e) => setEnableRedis(e.target.checked)}
                        />
                        <div>
                            <div className="font-medium text-gray-200">Enable Redis Memory</div>
                            <div className="text-xs text-gray-500 mt-1">Uses Redis for persistent conversation history. Provisions a Cloud Redis instance.</div>
                        </div>
                    </label>
                </div>
            </div>

            {/* Data Source Section */}
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-md">
                <h3 className="text-lg font-semibold text-white mb-4">Data Sources (RAG)</h3>
                <p className="text-sm text-gray-400 mb-6">Connect your agent to external data for grounded responses. (Recommended for RAG templates)</p>

                <div className="space-y-4">
                    {/* GCS Bucket */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">GCS Bucket URI</label>
                        <input
                            type="text"
                            value={gcsBucket}
                            onChange={(e) => setGcsBucket(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            placeholder="gs://my-agent-data"
                        />
                        <p className="text-xs text-gray-500 mt-1">For storing artifacts or RAG documents.</p>
                    </div>

                    {/* Data Store ID */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Vertex AI Search Data Store ID</label>
                        <input
                            type="text"
                            value={dataStoreId}
                            onChange={(e) => setDataStoreId(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-white focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                            placeholder="my-datastore-id"
                        />
                        <p className="text-xs text-gray-500 mt-1">ID of your existing Data Store in Vertex AI Search.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StepAdvanced;
