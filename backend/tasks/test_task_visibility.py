"""
Test task visibility and updates.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import AsyncSessionLocal
from sqlalchemy import select, text
from tasks.task_model import TaskORM

async def check_tasks():
    """Check what tasks exist and their assignments."""
    async with AsyncSessionLocal() as db:
        # Get all tasks
        result = await db.execute(select(TaskORM).order_by(TaskORM.created_at.desc()))
        tasks = result.scalars().all()

        print(f"Total tasks in database: {len(tasks)}\n")

        if len(tasks) == 0:
            print("No tasks found!")
            return

        print("=" * 80)
        print("TASK DETAILS:")
        print("=" * 80)

        for task in tasks:
            print(f"\nTask ID: {task.id}")
            print(f"  Title: {task.title}")
            print(f"  Status: {task.status}")
            print(f"  Priority: {task.priority}")
            print(f"  Category: {task.category}")
            print(f"  Assigned To: {task.assigned_to_email} ({task.assigned_to_name})")
            print(f"  Assigned By: {task.assigned_by_email} ({task.assigned_by_name})")
            print(f"  Created: {task.created_at}")
            print(f"  Updated: {task.updated_at}")
            print(f"  Tags: {task.tags}")

        # Check update trigger
        print("\n" + "=" * 80)
        print("CHECKING UPDATE TRIGGER:")
        print("=" * 80)

        result = await db.execute(text("""
            SELECT trigger_name, event_manipulation, event_object_table
            FROM information_schema.triggers
            WHERE event_object_table = 'tasks'
        """))
        triggers = result.fetchall()

        if triggers:
            for trig in triggers:
                print(f"  Trigger: {trig.trigger_name} on {trig.event_manipulation}")
        else:
            print("  WARNING: No triggers found on tasks table!")

if __name__ == "__main__":
    asyncio.run(check_tasks())
