import subprocess
import os
import sys
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams, StdioServerParameters

command = "echo" # Dummy
args = ["hello"]
connection_params = StdioConnectionParams(
    server_params=StdioServerParameters(command=command, args=args, env={}),
    timeout=600
)
toolset = McpToolset(connection_params=connection_params, tool_name_prefix="cloud_assist_")
print(dir(toolset))
print("Session:", hasattr(toolset, '_session'))
print("Client:", hasattr(toolset, '_client'))
print("Server params:", toolset.connection_params)
import cloudpickle
try:
    cloudpickle.dumps(toolset)
except Exception as e:
    print("Pickle error:", e)
