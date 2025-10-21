import React, { useState, useRef, useEffect } from 'react';
import { ReasoningEngine, ChatMessage, Config } from '../../types';
import * as api from '../../services/apiService';
import ResponseDetailsModal from '../agents/ResponseDetailsModal';
import CurlCommandsModal from './CurlCommandsModal';

interface DirectQueryChatWindowProps {
    engine: ReasoningEngine;
    config: Config;
    accessToken: string;
    onClose: () => void;
}

const DirectQueryChatWindow: React.FC<DirectQueryChatWindowProps> = ({ engine, config, accessToken, onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [detailsToShow, setDetailsToShow] = useState<ChatMessage['answerDetails'] | null>(null);
    const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    // When the component mounts or the engine changes, reset to a fresh conversation with a new session ID.
    useEffect(() => {
        setMessages([]);
        setSessionId(crypto.randomUUID());
        setError(null);
        setInput('');
    }, [engine]);

    const handleSend = async () => {
        if (!input.trim() || !sessionId) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        const currentQuery = input;
        
        const assistantMessageIndex = messages.length + 1;
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
        setInput('');
        setIsLoading(true);
        setError(null);
        
        let lastMetadata: any = null;

        try {
            await api.streamQueryReasoningEngine(
                engine.name,
                currentQuery,
                sessionId,
                config,
                accessToken,
                (parsedChunk) => {
                    const chunkText = parsedChunk.content?.parts?.[0]?.text || '';
                    if (chunkText) {
                        setMessages(prev => {
                            const newMessages = [...prev];
                            const lastMessage = newMessages[assistantMessageIndex];
                            if (lastMessage && lastMessage.role === 'assistant') {
                                const updatedLastMessage = { ...lastMessage, content: lastMessage.content + chunkText };
                                newMessages[assistantMessageIndex] = updatedLastMessage;
                                return newMessages;
                            }
                            return prev;
                        });
                    }
                    // The grounding metadata comes in the final chunk
                    if (parsedChunk.grounding_metadata) {
                        lastMetadata = parsedChunk.grounding_metadata;
                    }
                }
            );
        } catch (err: any) {
            const errorMessage = `Error: ${err.message || "Failed to get response from agent."}`;
            setError(errorMessage);
            setMessages(prev => {
                const newMessages = [...prev];
                const messageToUpdate = newMessages[assistantMessageIndex];
                if (messageToUpdate?.role === 'assistant' && messageToUpdate.content === '') {
                    newMessages[assistantMessageIndex] = { ...messageToUpdate, content: errorMessage };
                    return newMessages;
                }
                return [...prev, {role: 'assistant', content: errorMessage}];
            });
        } finally {
            setIsLoading(false);
            setMessages(prev => {
                const newMessages = [...prev];
                const messageToUpdate = newMessages[assistantMessageIndex];
                if (messageToUpdate && messageToUpdate.role === 'assistant') {
                    const updatedMessage = { 
                        ...messageToUpdate, 
                        answerDetails: lastMetadata ? { groundingMetadata: lastMetadata } : undefined
                    };
                    newMessages[assistantMessageIndex] = updatedMessage;
                    return newMessages;
                }
                return prev;
            });
        }
    };

    return (
      <>
        {isCurlModalOpen && (
            <CurlCommandsModal
                isOpen={isCurlModalOpen}
                onClose={() => setIsCurlModalOpen(false)}
                engineName={engine.name}
                config={config}
                sessionId={sessionId}
                messages={messages}
            />
        )}
        <div className="fixed bottom-4 right-4 z-40">
            <div className="flex flex-col h-[600px] w-[450px] bg-gray-800 shadow-2xl rounded-lg border border-gray-700">
                <ResponseDetailsModal isOpen={!!detailsToShow} onClose={() => setDetailsToShow(null)} details={detailsToShow} />

                <header className="p-4 flex justify-between items-center border-b border-gray-700 shrink-0">
                    <div className="flex items-center overflow-hidden">
                        <h2 className="text-lg font-bold text-white truncate" title={`Direct Query: ${engine.displayName}`}>Direct Query: {engine.displayName}</h2>
                    </div>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => setIsCurlModalOpen(true)}
                            className="text-gray-400 hover:text-white"
                            title="Show cURL commands"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                    </div>
                </header>
                
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'assistant' && msg.content && (
                                <div className="max-w-xl px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                                    <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                                </div>
                            )}
                            {msg.role === 'user' && (
                                <div className="max-w-xl px-4 py-2 rounded-lg bg-blue-600 text-white">
                                    <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                                </div>
                            )}
                            {msg.role === 'assistant' && msg.answerDetails?.groundingMetadata && (
                                <button
                                    onClick={() => setDetailsToShow(msg.answerDetails!)}
                                    className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-blue-600 rounded-md transition-colors self-end shrink-0"
                                    title="Show additional information"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}
                    {isLoading && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
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
                            placeholder="Type a direct query..."
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
      </>
    );
};

export default DirectQueryChatWindow;