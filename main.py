import os
import sys
import webbrowser
from pathlib import Path
import uvicorn

def main():
    # 1. Change working directory to backend
    project_root = Path(__file__).parent.resolve()
    backend_dir = project_root / "backend"
    
    if not backend_dir.exists():
        print(f"Error: Backend directory not found at {backend_dir}")
        sys.exit(1)
        
    os.chdir(backend_dir)
    sys.path.insert(0, str(backend_dir))
    
    # 2. Open the frontend in the browser
    print("Opening frontend in browser: http://localhost:8000/")
    webbrowser.open("http://localhost:8000/")
        
    # 3. Start the backend server
    print("Starting backend server on http://localhost:8000...")
    try:
        from main import app
        uvicorn.run(app, host="0.0.0.0", port=8000)
    except ImportError as e:
        print(f"Error importing backend app: {e}")
        print("Please ensure dependencies are installed via 'uv sync'")
        sys.exit(1)

if __name__ == "__main__":
    main()
