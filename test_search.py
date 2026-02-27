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
