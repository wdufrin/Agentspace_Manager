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
