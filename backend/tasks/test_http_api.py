"""
Test the task API via HTTP requests to simulate real frontend calls.
Requires the FastAPI server to be running on http://localhost:8000
"""
import requests
import json

API_BASE = "http://localhost:8000/api/v1/tasks"

def test_task_api():
    """Test task API endpoints via HTTP."""
    print("=" * 80)
    print("TESTING TASK API VIA HTTP")
    print("=" * 80)
    print(f"API Base URL: {API_BASE}\n")

    try:
        # Test 1: List all tasks (no auth for now)
        print("1. GET /api/v1/tasks (list all tasks)...")
        response = requests.get(API_BASE, timeout=5)
        print(f"   Status: {response.status_code}")

        if response.status_code == 200:
            tasks = response.json()
            print(f"   Found {len(tasks)} tasks")
            if tasks:
                print(f"   First task: {tasks[0]['id']} - {tasks[0]['title']}")
        elif response.status_code == 401:
            print("   ⚠️  Authentication required (401 Unauthorized)")
            print("   This is expected if auth middleware is enabled")
        else:
            print(f"   Error: {response.text}")

        # Test 2: List tasks filtered by assigned_to
        print("\n2. GET /api/v1/tasks?assigned_to=knyanguru@cut.ac.zw...")
        response = requests.get(
            API_BASE,
            params={"assigned_to": "knyanguru@cut.ac.zw"},
            timeout=5
        )
        print(f"   Status: {response.status_code}")

        if response.status_code == 200:
            tasks = response.json()
            print(f"   Found {len(tasks)} tasks assigned to knyanguru@cut.ac.zw")
            for task in tasks:
                print(f"     - {task['id']}: {task['title']}")
        elif response.status_code == 401:
            print("   ⚠️  Authentication required")
        else:
            print(f"   Error: {response.text}")

        # Test 3: Get task overview/stats
        print("\n3. GET /api/v1/tasks/overview...")
        response = requests.get(f"{API_BASE}/overview", timeout=5)
        print(f"   Status: {response.status_code}")

        if response.status_code == 200:
            overview = response.json()
            print(f"   Total: {overview.get('total', 'N/A')}")
            print(f"   Pending: {overview.get('pending', 'N/A')}")
            print(f"   In Progress: {overview.get('in_progress', 'N/A')}")
            print(f"   Completed: {overview.get('completed', 'N/A')}")
        elif response.status_code == 401:
            print("   ⚠️  Authentication required")

    except requests.exceptions.ConnectionError:
        print("\n❌ CONNECTION ERROR")
        print("   The FastAPI server is not running!")
        print("\n   To start the server, run:")
        print("   cd backend")
        print("   uvicorn main:app --reload")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False

    print("\n" + "=" * 80)
    return True

if __name__ == "__main__":
    success = test_task_api()
    if not success:
        print("\nPlease start the FastAPI server and try again.")
