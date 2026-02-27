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

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as api from '../services/apiService';

export interface ApiHistoryItem {
    id: string;
    timestamp: Date;
    method: string;
    url: string;
    curlCommand: string;
}

interface GlobalDebugContextType {
    showCurlPreview: boolean;
    setShowCurlPreview: (show: boolean) => void;
    apiHistory: ApiHistoryItem[];
    clearHistory: () => void;
}

const GlobalDebugContext = createContext<GlobalDebugContextType | undefined>(undefined);

export const GlobalDebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Default to false. Can potentially persist to localStorage in the future.
    const [showCurlPreview, setShowCurlPreview] = useState(false);
    const [apiHistory, setApiHistory] = useState<ApiHistoryItem[]>([]);

    useEffect(() => {
        // Register the logger
        api.setDebugLogger((log) => {
            if (!showCurlPreview) return; // Only log when enabled

            const newItem: ApiHistoryItem = {
                id: crypto.randomUUID(),
                timestamp: new Date(),
                method: log.method,
                url: log.url,
                curlCommand: log.curlCommand
            };

            setApiHistory(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50
        });

        return () => {
            api.setDebugLogger(null);
        };
    }, [showCurlPreview]);

    const clearHistory = () => setApiHistory([]);

    return (
        <GlobalDebugContext.Provider value={{ showCurlPreview, setShowCurlPreview, apiHistory, clearHistory }}>
            {children}
        </GlobalDebugContext.Provider>
    );
};

export const useGlobalDebug = () => {
    const context = useContext(GlobalDebugContext);
    if (context === undefined) {
        throw new Error('useGlobalDebug must be used within a GlobalDebugProvider');
    }
    return context;
};
