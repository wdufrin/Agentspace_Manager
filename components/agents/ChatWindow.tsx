import React, { useState, useRef, useEffect } from 'react';
import { Agent, ChatMessage, Config } from '../../types';
import * as api from '../../services/apiService';

interface ChatWindowProps {
    agent: Agent;
    config: Config;
    accessToken: string;
    onBack: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ agent, config, accessToken, onBack }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        const historyForApi = [...messages, userMessage];

        // Update UI with user message and empty assistant placeholder
        setMessages([...historyForApi, { role: 'assistant', content: '' }]);
        
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            // FIX: Added missing 'accessToken' argument to streamChat call.
            await api.streamChat(
                agent.name,
                historyForApi, // Pass the conversation history
                config,
                accessToken,
                (chunk) => {
                    setMessages(prev => {
                        const lastMessage = prev[prev.length - 1];
                        if (lastMessage && lastMessage.role === 'assistant') {
                            const updatedLastMessage = { ...lastMessage, content: lastMessage.content + chunk };
                            return [...prev.slice(0, -1), updatedLastMessage];
                        }
                        return prev;
                    });
                }
            );
        } catch (err: any) {
            const errorMessage = `Error: ${err.message || "Failed to get response from agent."}`;
            setError(errorMessage);
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg?.role === 'assistant') {
                    // Update the placeholder with the error message
                    return prev.slice(0, -1).concat({role: 'assistant', content: errorMessage});
                }
                // If for some reason there's no placeholder, add a new error message
                return [...prev, {role: 'assistant', content: errorMessage}];
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-15rem)] bg-gray-800 shadow-xl rounded-lg">
            <div className="p-4 flex justify-between items-center border-b border-gray-700">
                <div className="flex items-center">
                    {agent.icon?.uri && <img src={agent.icon.uri} alt="icon" className="h-8 w-8 rounded-full mr-3" />}
                    <h2 className="text-xl font-bold text-white">Chat with {agent.displayName}</h2>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl px-4 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                           <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                        </div>
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