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

import cloudpickle
from typing import Dict, Any

class MockCreds:
    token = "ya29"

def get_user_credentials(context):
    return MockCreds()

class StreamableHTTPConnectionParams:
    def __init__(self, url, timeout=None):
        pass

class McpToolset:
    def __init__(self, connection_params, tool_name_prefix, header_provider):
        self.header_provider = header_provider

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

if __name__ == "__main__":
    t = get_bigquery_mcp_toolset()
    try:
        dumped = cloudpickle.dumps(t)
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")
