import React from 'react';

interface SimpleMarkdownViewerProps {
    content: string;
    className?: string;
}

const SimpleMarkdownViewer: React.FC<SimpleMarkdownViewerProps> = ({ content, className }) => {
    // Basic Markdown Processing
    const renderMarkdown = (text: string): React.ReactNode[] => {
        const lines = text.split('\n');
        const elements: React.ReactNode[] = [];
        let codeBlockActive = false;
        let codeBlockContent: string[] = [];
        let codeBlockLanguage = '';

        lines.forEach((line, index) => {
            // Code Blocks
            if (line.trim().startsWith('```')) {
                if (codeBlockActive) {
                    // End code block
                    elements.push(
                        <div key={`code-${index}`} className="my-4 bg-gray-900 rounded-lg p-4 overflow-x-auto border border-gray-700">
                             {codeBlockLanguage && <div className="text-xs text-gray-500 mb-1 select-none">{codeBlockLanguage}</div>}
                            <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
                                {codeBlockContent.join('\n')}
                            </pre>
                        </div>
                    );
                    codeBlockActive = false;
                    codeBlockContent = [];
                    codeBlockLanguage = '';
                } else {
                    // Start code block
                    codeBlockActive = true;
                    codeBlockLanguage = line.trim().substring(3).trim();
                }
                return;
            }

            if (codeBlockActive) {
                codeBlockContent.push(line);
                return;
            }

            // Tables (Basic rendering as pre-formatted text for now, maybe improve later)
            if (line.trim().startsWith('|')) {
                 elements.push(
                    <div key={`table-row-${index}`} className="font-mono text-xs whitespace-pre overflow-x-auto text-gray-400">
                        {line}
                    </div>
                );
                return;
            }


            // Headers
            if (line.startsWith('# ')) {
                elements.push(<h1 key={index} className="text-3xl font-bold text-white mt-8 mb-4 border-b border-gray-700 pb-2">{line.substring(2)}</h1>);
                return;
            }
            if (line.startsWith('## ')) {
                elements.push(<h2 key={index} className="text-2xl font-bold text-gray-100 mt-6 mb-3">{line.substring(3)}</h2>);
                return;
            }
            if (line.startsWith('### ')) {
                elements.push(<h3 key={index} className="text-xl font-semibold text-gray-200 mt-5 mb-2">{line.substring(4)}</h3>);
                return;
            }
            if (line.startsWith('#### ')) {
                elements.push(<h4 key={index} className="text-lg font-semibold text-gray-300 mt-4 mb-2">{line.substring(5)}</h4>);
                return;
            }

            // Horizontal Rule
            if (line.trim() === '---' || line.trim() === '***') {
                elements.push(<hr key={index} className="my-6 border-gray-700" />);
                return;
            }

            // Blockquotes
            if (line.startsWith('> ')) {
                elements.push(
                    <div key={index} className="border-l-4 border-blue-500 pl-4 py-1 my-2 bg-gray-800/50 rounded-r text-gray-300 italic">
                        {line.substring(2)}
                    </div>
                );
                return;
            }

            // Lists
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                elements.push(
                    <li key={index} className="ml-4 list-disc text-gray-300 mb-1 pl-1">
                        {renderInline(line.trim().substring(2))}
                    </li>
                );
                return;
            }
            // Ordered Lists (basic support)
             if (/^\d+\.\s/.test(line.trim())) {
                const content = line.trim().replace(/^\d+\.\s/, '');
                elements.push(
                    <li key={index} className="ml-4 list-decimal text-gray-300 mb-1 pl-1">
                        {renderInline(content)}
                    </li>
                );
                return;
            }


            // Empty lines (paragraph breaks)
            if (line.trim() === '') {
                elements.push(<div key={index} className="h-2"></div>);
                return;
            }

            // Default Paragraph
            elements.push(<p key={index} className="text-gray-300 mb-2 leading-relaxed">{renderInline(line)}</p>);
        });

        return elements;
    };

    // Very basic inline parsing for bold, italic, code
    const renderInline = (text: string): React.ReactNode => {
        // Split by bold (**text**)
        // This is a naive implementation and won't handle nested styles deeply
        const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g); 
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={i} className="bg-gray-800 text-blue-300 px-1 py-0.5 rounded text-sm font-mono">{part.slice(1, -1)}</code>;
            }
            // Basic link detection (very naive) [text](url)
            const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
            if (linkMatch) {
                // Return text with link replaced (only supports one link per segment for now)
                const pre = part.substring(0, linkMatch.index);
                const linkText = linkMatch[1];
                const linkUrl = linkMatch[2];
                const post = part.substring((linkMatch.index || 0) + linkMatch[0].length);
                return (
                    <span key={i}>
                        {pre}
                        <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                            {linkText}
                        </a>
                        {post}
                    </span>
                );
            }
            
            return part;
        });
    };

    return (
        <div className={`markdown-body space-y-1 ${className}`}>
            {content ? renderMarkdown(content) : <p className="text-gray-500 italic">No content selected.</p>}
        </div>
    );
};

export default SimpleMarkdownViewer;
