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

import sys
import os

# Create dummy get_mcp_toolset
def get_mcp_toolset():
    from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams, StdioServerParameters
    command = "echo" # Dummy
    args = ["hello"]
    connection_params = StdioConnectionParams(
        server_params=StdioServerParameters(command=command, args=args, env={}),
        timeout=600
    )
    return McpToolset(connection_params=connection_params, tool_name_prefix="test_")

from google.adk.agents import Agent
agent = Agent(name="test", tools=[get_mcp_toolset()])
print("Tools in agent:", agent.tools)
print("Types:", [type(t) for t in agent.tools])
for t in agent.tools:
    print(dir(t))
