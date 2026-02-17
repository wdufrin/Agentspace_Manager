import sys
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams, StdioServerParameters
import subprocess
import cloudpickle

command = "echo" # Dummy
args = ["hello"]
connection_params = StdioConnectionParams(
    server_params=StdioServerParameters(command=command, args=args, env={}),
    timeout=600
)
t = McpToolset(connection_params=connection_params, tool_name_prefix="test_")
print("Attributes:", t.__dict__.keys())

import cloudpickle
try:
    cloudpickle.dumps(t)
    print("Success pickling McpToolset before setup")
except Exception as e:
    print("Failed pickling:", e)
    
t.setup() # try to see what happens after setup
print("Attributes after setup:", t.__dict__.keys())

