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
