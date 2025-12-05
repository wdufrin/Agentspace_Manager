
import React, { useState, useRef, useEffect } from 'react';
import { CloudRunService, ChatMessage } from '../../types';
import * as api from '../../services/apiService';

interface CloudRunQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    service: CloudRunService;
    accessToken: string;
}

const CloudRunQueryModal: React.FC<CloudRunQueryModalProps> = ({ isOpen, onClose, service, accessToken }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    // Reset on open/service change
    useEffect(() => {
        if (isOpen) {
            setMessages([]);
            setError(null);
            setInput('');
        }
    }, [isOpen, service]);

    if (!isOpen) return null;

    const envVars = service.template?.containers?.[0]?.env || [];
    const getEnv = (name: string) => envVars.find(e => e.name === name)?.value;
    const isA2a = !!(getEnv('AGENT_URL') || getEnv('PROVIDER_ORGANIZATION') || service.name.toLowerCase().includes('a2a'));
    const displayName = getEnv('AGENT_DISPLAY_NAME') || service.name.split('/').pop();

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
        const assistantIndex = messages.length + 1;
        
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            let responseText = '';

            if (isA2a) {
                // Use A2A invocation (JSON-RPC)
                const result = await api.invokeA2aAgent(service.uri, userMessage.content, accessToken);
                // A2A result structure: { message: { role: "agent", parts: [{ text: "..." }] } }
                responseText = result?.message?.parts?.[0]?.text || JSON.stringify(result);
            } else {
                // Generic Agent invocation (Simple POST)
                const response = await fetch(service.uri, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ prompt: userMessage.content, message: userMessage.content }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }

                const data = await response.json();
                responseText = data.response || data.reply || data.text || JSON.stringify(data);
            }

            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[assistantIndex] = { role: 'assistant', content: responseText };
                return newMessages;
            });

        } catch (err: any) {
            const errorMessage = `Error: ${err.message}`;
            setError(errorMessage);
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[assistantIndex] = { role: 'assistant', content: errorMessage };
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="flex flex-col h-[600px] w-[450px] bg-gray-800 shadow-2xl rounded-lg border border-gray-700">
                <header className="p-4 flex justify-between items-center border-b border-gray-700 shrink-0">
                    <div className="flex items-center overflow-hidden">
                        <div className={`w-2 h-2 rounded-full mr-2 ${isA2a ? 'bg-purple-500' : 'bg-teal-500'}`}></div>
                        <h2 className="text-lg font-bold text-white truncate" title={`Query: ${displayName}`}>
                            {displayName}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </header>
                
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && (
                                <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                                    <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                                </div>
                            )}
                            {msg.role === 'user' && (
                                <div className="max-w-[85%] px-4 py-2 rounded-lg bg-blue-600 text-white">
                                    <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                                </div>
                            )}
                        </div>
                    ))}
                    {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
                        <div className="flex justify-start">
                           <div className="max-w-xl px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                               <div className="flex items-center space-x-2">
                                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                   <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                               </div>
                           </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </main>

                {error && <p className="text-red-400 text-xs px-4 pb-2">{error}</p>}

                <footer className="p-4 border-t border-gray-700 shrink-0">
                    <div className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                            placeholder={`Message ${isA2a ? 'A2A Agent' : 'Agent'}...`}
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800"
                        >
                            Send
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default CloudRunQueryModal;
