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


import React from 'react';
import { Document } from '../../types';

interface DocumentDetailsProps {
  document: Document;
}

const DocumentDetails: React.FC<DocumentDetailsProps> = ({ document }) => {
  
  const jsonString = JSON.stringify(document, null, 2);
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-inner border border-gray-700">
        <header className="p-3 border-b border-gray-700">
            <h4 className="text-md font-semibold text-white">
                Selected Resource Details
            </h4>
        </header>
        <div className="p-3 max-h-[30rem] overflow-y-auto">
            <pre className="text-xs text-gray-200 whitespace-pre-wrap break-all">
                <code>{jsonString}</code>
            </pre>
        </div>
    </div>
  );
};

export default DocumentDetails;
