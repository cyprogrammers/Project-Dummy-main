"""
Test if the task engine can start up and seed tasks correctly.
"""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

async def test_startup():
    """Test the task engine startup and seeding."""
    print("Testing task engine startup...")

    # Import the seeding function
    from tasks.task_engine import _seed_tasks_if_empty

    try:
        # Run the seed function
        await _seed_tasks_if_empty()
        print("[OK] Task engine startup successful!")
        print("     Seed tasks added (or already exist)")
        return 0
    except Exception as e:
        print(f"[ERROR] Task engine startup failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(test_startup())
    sys.exit(exit_code)
