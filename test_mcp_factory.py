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


import os
import io

# Mock McpToolset behaving like the real one (unpickleable if instantiated)
class MockMcpToolset:
    def __init__(self):
        # Simulate an unpickleable open file handle
        self.f = open("agent.py", "r")

def get_bq_mcp_toolset():
    return MockMcpToolset()

# Scenario 1: Global Instantiation (The Problem)
try:
    print("Scenario 1: Instantiating tool globally...")
    tool_global = get_bq_mcp_toolset()
    import cloudpickle
    dumped = cloudpickle.dumps(tool_global)
    print("SUCCESS: Global tool pickled (Unexpected if unpickleable)")
except Exception as e:
    print(f"FAILURE: Global tool pickled failed as expected: {e}")

# Scenario 2: Factory Function (The Solution)
def create_agent():
    return get_bq_mcp_toolset()

try:
    import cloudpickle
    # We pickle the FUNCTION, not the RESULT
    dumped_func = cloudpickle.dumps(create_agent)
    print("SUCCESS: Factory function pickled!")
    
    # Verify it works when unpickled
    restored_func = cloudpickle.loads(dumped_func)
    # This will fail if file doesn't exist, so let's mock the file
    with open("agent.py", "w") as f: f.write("mock")
    agent = restored_func()
    print("SUCCESS: Restored factory created agent!")
    os.remove("agent.py")
except Exception as e:
    print(f"FAILURE: Factory function failed: {e}")
