import inspect
from google.adk.agents import Agent

print("Checking Agent class capabilities...")
try:
    sig = inspect.signature(Agent.query)
    print(f"Agent.query signature: {sig}")
    print(f"Agent.query annotations: {Agent.query.__annotations__}")
except Exception as e:
    print(f"Could not inspect Agent.query: {e}")

print("\nChecking Agent.__init__ signature...")
try:
    sig = inspect.signature(Agent.__init__)
    print(f"Agent.__init__ signature: {sig}")
except Exception as e:
    print(f"Could not inspect Agent.__init__: {e}")
