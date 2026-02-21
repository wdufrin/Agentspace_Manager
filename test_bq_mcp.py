import requests
import json
import google.auth
import google.auth.transport.requests

def test_bq_mcp():
    credentials, project = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)
    token = credentials.token
    
    url = 'https://bigquery.googleapis.com/mcp'
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'X-Goog-User-Project': project
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list"
    }
    
    print("Testing BQ MCP...")
    try:
        # Note: BQ MCP uses SSE, so a simple POST tools/list might behave differently 
        # But let's see what a standard HTTP POST does first
        response = requests.post(url, headers=headers, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
        
    print("\nTesting Logging MCP...")
    try:
        url_log = 'https://logging.googleapis.com/mcp'
        response_log = requests.post(url_log, headers=headers, json=payload)
        print(f"Status Code: {response_log.status_code}")
        print(f"Response: {response_log.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    test_bq_mcp()
