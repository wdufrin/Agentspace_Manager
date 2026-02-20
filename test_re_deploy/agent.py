
from google.adk.agents import Agent
from tools import get_bigquery_mcp_toolset
import logging

# Simulate an unpickleable object at module level works IF it's inside the factory
# But wait, get_bigquery_mcp_toolset() opens a file? 
# If I put it inside create_agent(), it opens at runtime.

def create_agent():
    # This simulate the "open file" happening effectively at instantiation time
    # which is now verifying that it happens INSIDE the container, not at import.
    return Agent(
        name="test",
        description="test",
        model="gemini-2.5-flash",
        instruction="test",
        tools=[get_bigquery_mcp_toolset()]
    )
