import React from 'react';

interface ResponseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: {
    diagnostics?: any;
    citations?: any[];
  } | null;
}

const ResponseDetailsModal: React.FC<ResponseDetailsModalProps> = ({ isOpen, onClose, details }) => {
  if (!isOpen || !details) return null;

  // Identify refused data stores from diagnostics before processing citations.
  const refusedDataStoreResources = new Set<string>();
  const plannerStepsForRefusalCheck = details.diagnostics?.plannerSteps || [];

  for (let i = 0; i < plannerStepsForRefusalCheck.length; i++) {
    const step = plannerStepsForRefusalCheck[i];
    const executableCodePart = step.planStep?.parts?.find((p: any) => p.executableCode);

    if (executableCodePart) {
      let toolOutput = '';
      // Look ahead for the corresponding result
      for (let j = i + 1; j < plannerStepsForRefusalCheck.length; j++) {
        const nextStep = plannerStepsForRefusalCheck[j];
        const resultPart = nextStep.planStep?.parts?.find((p: any) => p.codeExecutionResult);
        if (resultPart) {
          const outputValue = resultPart.codeExecutionResult.output;
          if (typeof outputValue === 'string') {
              toolOutput = outputValue;
          }
          break; // Found the result for this step
        }
      }
      
      const lowerOutput = toolOutput.toLowerCase();
      if (lowerOutput.includes('permission_denied') || lowerOutput.includes('permission denied') || lowerOutput.includes('access was denied')) {
        // Try to parse the resource name from the error message.
        const resourceMatch = toolOutput.match(/(projects\/[^\s/]+\/locations\/[^\s/]+\/collections\/[^\s/]+\/dataStores\/[^\s"']+)/);
        if (resourceMatch && resourceMatch[1]) {
          refusedDataStoreResources.add(resourceMatch[1]);
        }
      }
    }
  }

  // Parse tool usage from diagnosticInfo.plannerSteps by looking for executable code.
  const plannerSteps = details.diagnostics?.plannerSteps || [];
  const toolSteps: any[] = [];
  for (let i = 0; i < plannerSteps.length; i++) {
    const step = plannerSteps[i];
    // Find a step with executable code
    const executableCodePart = step.planStep?.parts?.find((p: any) => p.executableCode);
    if (executableCodePart) {
      const code = executableCodePart.executableCode.code;
      // Attempt to parse a tool name from the code string
      let toolName = 'Code Execution';
      const searchMatch = code.match(/print\(([^.]+)\.search/);
      if (searchMatch && searchMatch[1]) {
        toolName = `Tool: ${searchMatch[1]}`;
      }

      let toolOutput = '[No output found in subsequent steps]';
      // Look ahead for the corresponding result
      for (let j = i + 1; j < plannerSteps.length; j++) {
        const nextStep = plannerSteps[j];
        const resultPart = nextStep.planStep?.parts?.find((p: any) => p.codeExecutionResult);
        if (resultPart) {
          toolOutput = resultPart.codeExecutionResult.output;
          i = j; // Advance the outer loop past this result step to avoid re-processing
          break;
        }
      }
      
      // Create a synthetic object that mimics the 'toolStep' structure for consistent rendering
      toolSteps.push({
        toolStep: {
          tool: toolName,
          toolInput: code,
          toolOutput: toolOutput
        }
      });
    }
  }

  // Parse data sources from citations (which now contain 'references')
  const allCitations = details.citations || [];
  
  // Deduplicate data stores by their resource name from the document path
  const uniqueDataStores = new Map<string, { name: string; title: string }>();
  allCitations.forEach(reference => {
    const docPath = reference?.documentMetadata?.document;
    if (docPath) {
      const parts = docPath.split('/');
      const dsIndex = parts.indexOf('dataStores');
      if (dsIndex > -1 && dsIndex < parts.length - 1) {
        const dataStoreId = parts[dsIndex + 1];
        // Reconstruct the full path up to the data store ID to use as a unique key
        const dataStoreKey = parts.slice(0, dsIndex + 2).join('/');
        // Only add the data store if it wasn't refused and hasn't been added yet.
        if (!refusedDataStoreResources.has(dataStoreKey) && !uniqueDataStores.has(dataStoreKey)) {
          uniqueDataStores.set(dataStoreKey, {
            name: dataStoreKey, // The unique key/path
            title: dataStoreId, // Just the ID for display
          });
        }
      }
    }
  });
  const dataSources = Array.from(uniqueDataStores.values());
  
  const hasTools = toolSteps.length > 0;
  const hasDataSources = dataSources.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Response Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>

        <main className="p-6 overflow-y-auto space-y-6">
          {!hasTools && !hasDataSources ? (
            <p className="text-gray-400 text-center">No detailed tool or data store information was found for this response.</p>
          ) : (
            <>
              {hasTools && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Tools Used</h3>
                  <div className="space-y-4">
                    {toolSteps.map((step: any, index: number) => (
                      <div key={index} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <p className="text-sm font-semibold text-blue-400 font-mono">{step.toolStep.tool}</p>
                        <div className="mt-2 space-y-2 text-xs">
                          <div>
                            <p className="font-bold text-gray-400">Input:</p>
                            <pre className="bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap font-mono text-gray-300"><code>{step.toolStep.toolInput}</code></pre>
                          </div>
                          <div>
                            <p className="font-bold text-gray-400">Output:</p>
                            <pre className="bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap font-mono text-gray-300"><code>{step.toolStep.toolOutput}</code></pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasDataSources && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Data Sources</h3>
                   <ul className="space-y-2">
                    {dataSources.map((source: any, index: number) => (
                      <li key={index} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <p className="text-sm font-semibold text-green-400">Data Store Used</p>
                        <p className="text-xs font-mono text-gray-300 mt-1" title={source.name}>{source.title}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </main>
        
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default ResponseDetailsModal;