"""
Fresh test of seeding - bypasses module caching issues.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# Force reimport by deleting from cache
if 'tasks.task_db_model' in sys.modules:
    del sys.modules['tasks.task_db_model']
if 'tasks.task_engine' in sys.modules:
    del sys.modules['tasks.task_engine']

from db.database import AsyncSessionLocal
from tasks.task_db_model import TaskORM

async def test_seed():
    """Test inserting a single task manually."""
    print("Testing manual task insertion...")

    async with AsyncSessionLocal() as db:
        # Create a simple task with correct enum values
        task = TaskORM(
            id="TASK-TEST0001",
            title="Test Task",
            description="This is a test task",
            category="Backup",  # String value matching database enum
            priority="P1",      # String value matching database enum
            status="pending",   # String value matching database enum
            assigned_to_email="test@example.com",
            assigned_to_name="Test User",
            tags=["test"],
            attachment_refs=[]
        )

        db.add(task)
        try:
            await db.commit()
            print("[OK] Task inserted successfully!")
            print(f"     Task ID: {task.id}")
            print(f"     Category: {task.category}")
            print(f"     Priority: {task.priority}")
            print(f"     Status: {task.status}")

            # Clean up
            await db.delete(task)
            await db.commit()
            print("[OK] Test task cleaned up")
            return 0
        except Exception as e:
            print(f"[ERROR] Failed to insert task: {e}")
            await db.rollback()
            return 1

if __name__ == "__main__":
    exit_code = asyncio.run(test_seed())
    sys.exit(exit_code)
