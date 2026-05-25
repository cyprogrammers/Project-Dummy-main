"""
Comprehensive verification that the enum fix is working.
This script bypasses all module caching to ensure we test the current code.
"""
import asyncio
import sys
import subprocess
from pathlib import Path

async def verify_model():
    """Verify the model can be imported and works correctly."""
    print("=" * 60)
    print("VERIFICATION: Task Model Enum Fix")
    print("=" * 60)

    # Start fresh - run in a new Python process to avoid caching
    print("\n1. Testing task model can create records...")

    test_script = '''
import asyncio
import sys
sys.path.insert(0, r"c:\\Users\\mbanda\\Downloads\\Projects\\Project-Dummy-main\\backend")

from db.database import AsyncSessionLocal
from tasks.task_db_model import TaskORM

async def test():
    async with AsyncSessionLocal() as db:
        task = TaskORM(
            id="TASK-VERIFY01",
            title="Verification Task",
            description="Testing enum fix",
            category="Security",
            priority="P2",
            status="pending",
            tags=[],
            attachment_refs=[]
        )
        db.add(task)
        await db.commit()
        print("SUCCESS: Task created with enums")

        # Cleanup
        await db.delete(task)
        await db.commit()
        return 0

asyncio.run(test())
'''

    result = subprocess.run(
        [sys.executable, "-c", test_script],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print("   [OK] Task model working correctly")
        print(f"   Output: {result.stdout.strip()}")
    else:
        print("   [FAIL] Task model has issues")
        print(f"   Error: {result.stderr}")
        return False

    print("\n2. Testing seeding function...")

    seed_script = '''
import asyncio
import sys
sys.path.insert(0, r"c:\\Users\\mbanda\\Downloads\\Projects\\Project-Dummy-main\\backend")

from db.database import AsyncSessionLocal
from sqlalchemy import select, func
from tasks.task_db_model import TaskORM
from tasks.task_engine import _seed_tasks_if_empty

async def test():
    # Clear existing tasks first
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(TaskORM))
        tasks = result.scalars().all()
        for task in tasks:
            await db.delete(task)
        await db.commit()
        print(f"Cleared {len(tasks)} existing tasks")

    # Now try seeding
    await _seed_tasks_if_empty()
    print("SUCCESS: Seeding completed")

    # Verify
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(func.count(TaskORM.id)))
        count = result.scalar()
        print(f"Database now has {count} tasks")

asyncio.run(test())
'''

    result = subprocess.run(
        [sys.executable, "-c", seed_script],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print("   [OK] Seeding function working correctly")
        for line in result.stdout.strip().split('\n'):
            print(f"   {line}")
    else:
        print("   [FAIL] Seeding function has issues")
        print(f"   Error: {result.stderr[-500:]}")  # Last 500 chars of error
        return False

    print("\n" + "=" * 60)
    print("ALL VERIFICATIONS PASSED!")
    print("=" * 60)
    print("\nThe application should now start successfully.")
    print("You can start it with:")
    print("  cd backend")
    print("  uvicorn main:app --reload")
    return True

if __name__ == "__main__":
    success = asyncio.run(verify_model())
    sys.exit(0 if success else 1)
