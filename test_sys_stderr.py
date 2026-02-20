import cloudpickle
import sys
try:
    cloudpickle.dumps(sys.stderr)
    print("Success")
except Exception as e:
    print(f"Failed to pickle sys.stderr: {e}")
