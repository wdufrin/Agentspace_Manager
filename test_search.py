
# test_search.py
# This script tests the tool_search_datastore function in isolation.

import os
import sys
import logging
from dotenv import load_dotenv

# Load env before imports
load_dotenv("./examples/wif_datastore_search_agent/.env")

# Add path so we can import from the package
sys.path.append("./examples/wif_datastore_search_agent")

try:
    from tools import tool_search_datastore
    from google.adk.tools import ToolContext
except ImportError as e:
    print(f"Import Error: {e}")
    # Try importing as if we are inside the package
    sys.path.append(".")
    from examples.wif_datastore_search_agent.tools import tool_search_datastore
    from google.adk.tools import ToolContext

# Setup minimal logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    print("Testing Search Tool...")
    
    class MockContext:
        def __init__(self):
            self.state = {}
    
    context = MockContext()
    
    # Query for something likely to exist
    query = "Yumi" 
    
    print(f"Querying: '{query}'")
    result = tool_search_datastore(query, context)
    
    print("\n--- RESULT ---")
    print(result)
    print("--------------\n")

if __name__ == "__main__":
    main()
