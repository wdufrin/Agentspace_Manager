import cloudpickle
from google.adk.tools.mcp_tool import StreamableHTTPConnectionParams

params = StreamableHTTPConnectionParams(url="https://test.com")
try:
    cloudpickle.dumps(params)
    print("Success pickling StreamableHTTPConnectionParams")
except Exception as e:
    print(f"Failed to pickle StreamableHTTPConnectionParams: {e}")
    import traceback
    traceback.print_exc()
