# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import requests
import google.auth
from typing import Any, Dict
from auth import get_user_credentials
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams

def get_bigquery_mcp_toolset() -> McpToolset:
    def auth_header_provider(context: Any) -> Dict[str, str]:
        creds = get_user_credentials(context)
        if creds and creds.token:
             return {"Authorization": f"Bearer {creds.token}"}
        return {}
        
    connection_params = StreamableHTTPConnectionParams(
        url="https://bigquery.googleapis.com/mcp",
        timeout=30.0
    )
    return McpToolset(
        connection_params=connection_params, 
        tool_name_prefix="bigquery_",
        header_provider=auth_header_provider
    )
