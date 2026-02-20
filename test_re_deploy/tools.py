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
