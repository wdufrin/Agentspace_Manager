import cloudpickle
import asyncio

lock = asyncio.Lock()
try:
    cloudpickle.dumps(lock)
    print("Success pickling Lock")
except Exception as e:
    print(f"Failed to pickle asyncio.Lock: {e}")
