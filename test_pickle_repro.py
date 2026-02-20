
import cloudpickle
import sys
import os

# Add repro dir to path
sys.path.append(os.path.join(os.getcwd(), 'repro'))

try:
    import app
    print(f"Imported app: {app}")
    print(f"App instance: {app.app}")
    
    dumped = cloudpickle.dumps(app.app)
    print("Pickled successfully!")
    
    loaded = cloudpickle.loads(dumped)
    print(f"Loaded successfully: {loaded}")
    
except Exception as e:
    print(f"Pickling failed: {e}")
    import traceback
    traceback.print_exc()
