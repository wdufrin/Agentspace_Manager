
import React, { useState } from 'react';
import { generateVertexContent } from '../../services/apiService';
import { Config } from '../../types';

interface StepCustomizeProps {
  config: Config;
  files: { path: string; content: string; encoding?: 'utf-8' | 'base64' }[];
  setFiles: (files: { path: string; content: string; encoding?: 'utf-8' | 'base64' }[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const StepCustomize: React.FC<StepCustomizeProps> = ({ config, files, setFiles, onNext, onBack }) => {
  const [instructions, setInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(files.find(f => f.path.endsWith('agent.py'))?.path || files[0]?.path || null);

  const handleGenerate = async () => {
    if (!instructions.trim()) return;
    setIsGenerating(true);
    setGenerationError(null);

    try {
        // Find the most relevant file to edit (usually agent.py or specified by user?)
        // For now, let's strictly edit the SELECTED file if it's text.
        const targetFileIndex = files.findIndex(f => f.path === selectedFile);
        if (targetFileIndex === -1) throw new Error("No file selected");
        
        const targetFile = files[targetFileIndex];
        if (targetFile.encoding === 'base64') throw new Error("Cannot edit binary files with AI");

        const prompt = `
You are an expert Google Cloud ADK developer.
Please update the following agent code based on these instructions: "${instructions}"

CODE:
\`\`\`python
${targetFile.content}
\`\`\`

Return ONLY the updated code block. Do not include markdown formatting if possible, or wrap it in \`\`\` code blocks.
`;
        let newContent = await generateVertexContent(config, prompt);
        
        // Strip markdown code blocks if present
        newContent = newContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');

        const newFiles = [...files];
        newFiles[targetFileIndex] = { ...targetFile, content: newContent };
        setFiles(newFiles);
        alert("Code updated successfully!");
    } catch (error: any) {
      console.error('Generation failed:', error);
      setGenerationError(error.message || 'Failed to generate content.');
    } finally {
      setIsGenerating(false);
    }
  };

  const activeFileContent = files.find(f => f.path === selectedFile)?.content || '';
  const isBinary = files.find(f => f.path === selectedFile)?.encoding === 'base64';

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">Customize with AI</h3>
        
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-400 mb-1">Select File to Edit</label>
            <select 
                value={selectedFile || ''} 
                onChange={(e) => setSelectedFile(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:ring-teal-500 focus:border-teal-500"
            >
                {files.map(f => (
                    <option key={f.path} value={f.path}>{f.path} {f.encoding === 'base64' ? '(Binary)' : ''}</option>
                ))}
            </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-400 mb-1">Custom Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="E.g., 'Add a retry mechanism to the search tool' or 'Change the system prompt to be more formal'"
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white h-24 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {generationError && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
            {generationError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !instructions.trim() || isBinary}
            className={`px-4 py-2 rounded font-medium transition-colors flex items-center gap-2 ${
              isGenerating || !instructions.trim() || isBinary
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Apply Changes
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-300">File Preview: {selectedFile}</span>
        </div>
        <div className="p-4 overflow-auto max-h-96 custom-scrollbar">
            {isBinary ? (
                <div className="text-gray-500 italic text-center p-8">Binary file content cannot be displayed.</div>
            ) : (
                <pre className="text-gray-300 text-sm font-mono whitespace-pre-wrap">{activeFileContent}</pre>
            )}
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onBack}
          className="px-6 py-2 rounded font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded font-medium bg-teal-600 hover:bg-teal-700 text-white transition-colors"
        >
          Next: Deploy
        </button>
      </div>
    </div>
  );
};

export default StepCustomize;
