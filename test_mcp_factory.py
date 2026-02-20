
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
