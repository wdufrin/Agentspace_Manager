
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, Config, DataStore } from '../../types';
import * as api from '../../services/apiService';
import ResponseDetailsModal from './ResponseDetailsModal';
import ChatCurlModal from './ChatCurlModal';

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
    const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
    
    // Data Store Filtering State
    const [linkedDataStores, setLinkedDataStores] = useState<DataStore[]>([]);
    const [selectedDsNames, setSelectedDsNames] = useState<Set<string>>(new Set());
    const [isFetchingTools, setIsFetchingTools] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const filterRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages, thinkingProcess]);

    // Handle clicking outside filter menu to close it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setShowFilters(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch all linked data stores and their display names
    const fetchLinkedTools = useCallback(async () => {
        if (!config.appId) return;
        
        setIsFetchingTools(true);
        try {
            // 1. Get engine to find linked data store IDs
            const fullEngine = await api.getEngine(`projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId}/engines/${config.appId}`, config);
            const dsIds = fullEngine.dataStoreIds || [];
            
            if (dsIds.length === 0) {
                setLinkedDataStores([]);
                setSelectedDsNames(new Set());
                return;
            }

            // 2. Fetch all data stores in the collection to get friendly names
            const dsResponse = await api.listResources('dataStores', config);
            const allDataStores: DataStore[] = dsResponse.dataStores || [];
            
            // 3. Match and store
            const matched = allDataStores.filter(ds => {
                const id = ds.name.split('/').pop();
                return dsIds.includes(id || '');
            });

            setLinkedDataStores(matched);
            // Default to ALL selected
            setSelectedDsNames(new Set(matched.map(m => m.name)));
        } catch (e) {
            console.warn("Failed to auto-fetch tools for engine", e);
        } finally {
            setIsFetchingTools(false);
        }
    }, [config]);

    useEffect(() => {
        setMessages([]);
        setSessionId(null);
        setError(null);
        setInput('');
        setThinkingProcess(null);
        fetchLinkedTools();
    }, [targetDisplayName, fetchLinkedTools]);

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

        // Build toolsSpec based on CURRENT filter selection
        const toolsSpec: any = selectedDsNames.size > 0 ? {
            vertexAiSearchSpec: {
                dataStoreSpecs: Array.from(selectedDsNames).map(ds => ({ dataStore: ds }))
            }
        } : undefined;

        try {
            await api.streamChat(
                null, 
                currentQuery,
                sessionId,
                config,
                accessToken,
                (parsedChunk) => {
                    const newSessionId = parsedChunk.sessionInfo?.session;
                    if (newSessionId && !sessionId) {
                        setSessionId(newSessionId);
                    }
                    
                    if (parsedChunk.answer?.diagnosticInfo && parsedChunk.answer?.state === 'SUCCEEDED') {
                        finalDiagnostics = parsedChunk.answer.diagnosticInfo;
                    }

                    const skippedReasons = parsedChunk.answer?.assistSkippedReasons;
                    if (Array.isArray(skippedReasons) && skippedReasons.includes('NON_ASSIST_SEEKING_QUERY_IGNORED')) {
                        skipReason = 'NON_ASSIST_SEEKING_QUERY_IGNORED';
                    }
                    
                    if (parsedChunk.answer?.replies) {
                        for (const reply of parsedChunk.answer.replies) {
                            const references = reply.groundedContent?.textGroundingMetadata?.references;
                            if (references) {
                                allCitations.push(...references);
                            }
                        }
                    }

                    const replyContent = parsedChunk.answer?.replies?.[0]?.groundedContent?.content;
                    
                    if (replyContent) {
                        if (replyContent.thought && replyContent.text) {
                            setThinkingProcess(prev => (prev ? prev + replyContent.text : replyContent.text));
                        }
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
                },
                toolsSpec
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
            setThinkingProcess(null);
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

    const toggleDs = (name: string) => {
        setSelectedDsNames(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full bg-gray-800 shadow-xl rounded-lg border border-gray-700 relative">
            <ResponseDetailsModal isOpen={!!detailsToShow} onClose={() => setDetailsToShow(null)} details={detailsToShow} />
            <ChatCurlModal 
                isOpen={isCurlModalOpen} 
                onClose={() => setIsCurlModalOpen(false)} 
                config={config} 
                sessionId={sessionId} 
                messages={messages} 
                selectedDataStores={Array.from(selectedDsNames)}
            />

            <div className="p-4 flex justify-between items-center border-b border-gray-700 bg-gray-900/20">
                <div className="flex items-center overflow-hidden gap-3">
                    <h2 className="text-lg font-bold text-white truncate" title={`Test Agent: ${targetDisplayName}`}>{targetDisplayName}</h2>
                    {isFetchingTools && <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400"></div>}
                </div>
                <div className="flex items-center gap-2">
                    {/* Filters Toggle */}
                    <div className="relative" ref={filterRef}>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-1.5 rounded-md transition-colors flex items-center gap-1.5 text-xs font-semibold ${selectedDsNames.size !== linkedDataStores.length ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
                            title="Filter Data Stores"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                            </svg>
                            Filters {linkedDataStores.length > 0 && `(${selectedDsNames.size})`}
                        </button>
                        
                        {showFilters && (
                            <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-[70] p-3 animate-fade-in-up">
                                <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-3 tracking-widest">Active Data Stores</h4>
                                {linkedDataStores.length === 0 ? (
                                    <p className="text-xs text-gray-600 italic py-2">No linked data stores found.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                        {linkedDataStores.map(ds => (
                                            <label key={ds.name} className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded cursor-pointer transition-colors group">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedDsNames.has(ds.name)}
                                                    onChange={() => toggleDs(ds.name)}
                                                    className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium text-gray-300 truncate group-hover:text-white">{ds.displayName}</p>
                                                    <p className="text-[9px] text-gray-500 truncate font-mono">{ds.name.split('/').pop()}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <div className="mt-3 pt-3 border-t border-gray-800 flex justify-between">
                                    <button 
                                        onClick={() => setSelectedDsNames(new Set(linkedDataStores.map(d => d.name)))}
                                        className="text-[10px] text-blue-400 hover:text-blue-300 font-bold"
                                    >
                                        Select All
                                    </button>
                                    <button 
                                        onClick={() => setSelectedDsNames(new Set())}
                                        className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => setIsCurlModalOpen(true)}
                        className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                        title="Show Assistant API commands (streamAssist)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button onClick={onClose} className="px-2 py-1.5 text-xs bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700">
                        &times;
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && msg.content && (
                            <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-700 text-gray-200 shadow-sm border border-gray-600/50">
                                <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                            </div>
                        )}
                        {msg.role === 'user' && (
                            <div className="max-w-[85%] px-4 py-2 rounded-lg bg-blue-600 text-white shadow-md">
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
                       <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 text-xs italic shadow-inner">
                           <p className="font-bold mb-1 uppercase tracking-widest text-[9px] text-gray-500">LLM Reasoning</p>
                           <p style={{whiteSpace: 'pre-wrap'}}>{thinkingProcess}</p>
                       </div>
                    </div>
                )}

                {isLoading && !thinkingProcess && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
                    <div className="flex justify-start">
                       <div className="max-w-xl px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                           <div className="flex items-center space-x-2">
                               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                           </div>
                       </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {error && !messages.some(m => m.content.includes(error)) && <p className="text-red-400 px-4 pb-2 text-xs">{error}</p>}

            <div className="p-4 border-t border-gray-700 bg-gray-900/10">
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
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800 transition-colors shadow-lg"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatWindow;
