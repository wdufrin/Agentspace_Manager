/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, useEffect } from 'react';
import SimpleMarkdownViewer from '../components/SimpleMarkdownViewer';

interface SkillsPageProps {
    projectNumber: string;
}

const SKILLS_LIST = [
    { id: 'adk-scaffold', title: 'Project Scaffolding', filename: 'adk-scaffold.md' },
    { id: 'adk-cheatsheet', title: 'ADK Cheatsheet', filename: 'adk-cheatsheet.md' },
    { id: 'adk-dev-guide', title: 'Development Guide', filename: 'adk-dev-guide.md' },
    { id: 'adk-eval-guide', title: 'Evaluation Guide', filename: 'adk-eval-guide.md' },
    { id: 'adk-deploy-guide', title: 'Deployment Guide', filename: 'adk-deploy-guide.md' },
];

const SkillsPage: React.FC<SkillsPageProps> = () => {
    const [selectedSkillId, setSelectedSkillId] = useState<string>(SKILLS_LIST[0].id);
    const [markdownContent, setMarkdownContent] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSkillContent = async () => {
            setLoading(true);
            setError(null);
            const skill = SKILLS_LIST.find(s => s.id === selectedSkillId);
            
            if (!skill) {
                setError('Skill not found.');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/skills/${skill.filename}`);
                if (!response.ok) {
                    throw new Error(`Failed to load skill content: ${response.statusText}`);
                }
                const text = await response.text();
                setMarkdownContent(text);
            } catch (err: any) {
                console.error("Error fetching skill:", err);
                setError(`Could not load skill: ${err.message}`);
                setMarkdownContent('');
            } finally {
                setLoading(false);
            }
        };

        fetchSkillContent();
    }, [selectedSkillId]);

    return (
        <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
            {/* Sidebar List */}
            <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
                <div className="p-4 border-b border-gray-700">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        ADK Skills
                    </h2>
                </div>
                <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                    {SKILLS_LIST.map(skill => (
                        <button
                            key={skill.id}
                            onClick={() => setSelectedSkillId(skill.id)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                selectedSkillId === skill.id
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                        >
                            {skill.title}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-gray-900 p-8 custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                        </div>
                    ) : error ? (
                        <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg">
                            <h3 className="font-bold text-lg mb-2">Error</h3>
                            <p>{error}</p>
                        </div>
                    ) : (
                        <div className="prose prose-invert max-w-none">
                            <SimpleMarkdownViewer content={markdownContent} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SkillsPage;
