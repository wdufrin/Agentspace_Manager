
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Config } from '../../types';
import * as api from '../../services/apiService';
import ResponseDetailsModal from './ResponseDetailsModal';

interface ChatWindowProps {
    targetDisplayName: string;
    config: Config;
    accessToken: string;
    onClose: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ targetDisplayName, config, accessToken, onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [detailsToShow, setDetailsToShow] = useState<ChatMessage['answerDetails'] | null>(null);
    const [thinkingProcess, setThinkingProcess] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages, thinkingProcess]);

    // When the component mounts or the agent changes, reset to a fresh conversation.
    useEffect(() => {
        setMessages([]);
        setSessionId(null);
        setError(null);
        setInput('');
        setThinkingProcess(null);
    }, [targetDisplayName]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        const currentQuery = input;
        
        const assistantMessageIndex = messages.length + 1;
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
        setInput('');
        setIsLoading(true);
        setError(null);
        setThinkingProcess(null);

        let wasMessageReceived = false;
        let skipReason: string | null = null;
        let finalDiagnostics: any = null;
        let allCitations: any[] = [];

        try {
            await api.streamChat(
                null, // No specific agent is targeted, chat with the assistant directly
                currentQuery,
                sessionId, // Pass the current session ID
                config,
                accessToken,
                (parsedChunk) => {
                    // Capture the session ID from the first response chunk
                    const newSessionId = parsedChunk.sessionInfo?.session;
                    if (newSessionId && !sessionId) {
                        setSessionId(newSessionId);
                    }
                    
                    // Capture diagnostics on the final chunk
                    if (parsedChunk.answer?.diagnosticInfo && parsedChunk.answer?.state === 'SUCCEEDED') {
                        finalDiagnostics = parsedChunk.answer.diagnosticInfo;
                    }

                    // Check if the assistant skipped the query
                    const skippedReasons = parsedChunk.answer?.assistSkippedReasons;
                    if (Array.isArray(skippedReasons) && skippedReasons.includes('NON_ASSIST_SEEKING_QUERY_IGNORED')) {
                        skipReason = 'NON_ASSIST_SEEKING_QUERY_IGNORED';
                    }
                    
                    // Aggregate citations from ANY chunk that has them (not just SUCCEEDED)
                    if (parsedChunk.answer?.replies) {
                        for (const reply of parsedChunk.answer.replies) {
                            const references = reply.groundedContent?.textGroundingMetadata?.references;
                            if (references) {
                                allCitations.push(...references);
                            }
                        }
                    }

                    // Extract the content from the chunk
                    const replyContent = parsedChunk.answer?.replies?.[0]?.groundedContent?.content;
                    
                    if (replyContent) {
                        // Handle "Thought" chunks
                        if (replyContent.thought && replyContent.text) {
                            setThinkingProcess(prev => (prev ? prev + replyContent.text : replyContent.text));
                        }
                        // Handle "Answer" chunks
                        else if (replyContent.text) {
                            wasMessageReceived = true;
                            const chunkText = replyContent.text;
                            setMessages(prev => {
                                const newMessages = [...prev];
                                const lastMessage = newMessages[newMessages.length - 1];
                                if (lastMessage && lastMessage.role === 'assistant') {
                                    const updatedLastMessage = { ...lastMessage, content: lastMessage.content + chunkText };
                                    newMessages[newMessages.length - 1] = updatedLastMessage;
                                    return newMessages;
                                }
                                return prev;
                            });
                        }
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
            setThinkingProcess(null); // Clear thought process when done
            setMessages(prev => {
                const newMessages = [...prev];
                const messageToUpdate = newMessages[assistantMessageIndex];

                if (messageToUpdate && messageToUpdate.role === 'assistant') {
                    const answerDetails = (finalDiagnostics || allCitations.length > 0)
                        ? { diagnostics: finalDiagnostics, citations: allCitations }
                        : undefined;
                    
                    let finalContent = messageToUpdate.content;
                    if (!wasMessageReceived && finalContent === '') {
                         if (skipReason === 'NON_ASSIST_SEEKING_QUERY_IGNORED') {
                            finalContent = "[The agent ignored the greeting as it was not a direct question. Please ask a specific question to get a response.]";
                        } else {
                            finalContent = "[The agent processed your request but did not provide a response. Please try rephrasing or ask something else.]";
                        }
                    }

                    const updatedMessage = { 
                        ...messageToUpdate, 
                        content: finalContent, 
                        answerDetails 
                    };
                    
                    newMessages[assistantMessageIndex] = updatedMessage;
                    return newMessages;
                }
                return prev;
            });
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-800 shadow-xl rounded-lg border border-gray-700">
            <ResponseDetailsModal isOpen={!!detailsToShow} onClose={() => setDetailsToShow(null)} details={detailsToShow} />

            <div className="p-4 flex justify-between items-center border-b border-gray-700">
                <div className="flex items-center overflow-hidden">
                    <h2 className="text-lg font-bold text-white truncate" title={`Test Agent: ${targetDisplayName}`}>Test Agent: {targetDisplayName}</h2>
                </div>
                <button onClick={onClose} className="px-3 py-1.5 text-xs bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700">
                    &larr; Change Engine
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        {msg.role === 'assistant' && msg.answerDetails && (
                            <button
                                onClick={() => setDetailsToShow(msg.answerDetails!)}
                                className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-blue-600 rounded-md transition-colors self-end shrink-0"
                                title="Show response details"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </button>
                        )}
                    </div>
                ))}
                
                {thinkingProcess && (
                     <div className="flex justify-start animate-pulse">
                       <div className="max-w-xl px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 text-xs italic">
                           <p className="font-bold mb-1">Thinking...</p>
                           <p style={{whiteSpace: 'pre-wrap'}}>{thinkingProcess}</p>
                       </div>
                    </div>
                )}

                {isLoading && !thinkingProcess && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
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
            </div>

            {error && !messages.some(m => m.content.includes(error)) && <p className="text-red-400 px-4 pb-2">{error}</p>}

            <div className="p-4 border-t border-gray-700">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                        placeholder="Type your message..."
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
            </div>
        </div>
    );
};

export default ChatWindow;
