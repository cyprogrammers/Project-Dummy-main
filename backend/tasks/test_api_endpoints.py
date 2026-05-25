"""
Test the task API endpoints to verify they work correctly.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import AsyncSessionLocal
from sqlalchemy import select
from tasks.task_model import TaskORM
from tasks.task_engine import list_tasks, create_task, update_task, get_task
from tasks.task_engine import TaskCreate, TaskUpdate, TaskCategory, TaskPriority

async def test_endpoints():
    """Test various task operations."""
    print("=" * 80)
    print("TESTING TASK API ENDPOINTS")
    print("=" * 80)

    async with AsyncSessionLocal() as db:
        # Test 1: List all tasks
        print("\n1. Testing list_tasks() with no filters...")
        tasks = await list_tasks(db=db)
        print(f"   Found {len(tasks)} tasks")

        # Test 2: Filter by assigned_to
        print("\n2. Testing list_tasks() filtered by assigned_to='tech@cut.ac.zw'...")
        tech_tasks = await list_tasks(assigned_to="tech@cut.ac.zw", db=db)
        print(f"   Found {len(tech_tasks)} tasks assigned to tech@cut.ac.zw")
        for t in tech_tasks[:2]:
            print(f"     - {t.id}: {t.title}")

        # Test 3: Filter by assigned_to for the newly created task
        print("\n3. Testing list_tasks() filtered by assigned_to='knyanguru@cut.ac.zw'...")
        kupa_tasks = await list_tasks(assigned_to="knyanguru@cut.ac.zw", db=db)
        print(f"   Found {len(kupa_tasks)} tasks assigned to knyanguru@cut.ac.zw")
        for t in kupa_tasks:
            print(f"     - {t.id}: {t.title} | Status: {t.status}")

        # Test 4: Create a new task
        print("\n4. Testing create_task()...")
        new_task_data = TaskCreate(
            title="Test Task - API Verification",
            description="This is a test task to verify the API works",
            category=TaskCategory.system,
            priority=TaskPriority.p2,
            assigned_to_email="knyanguru@cut.ac.zw",
            assigned_to_name="Kupakwashe Nyanguru",
            assigned_by_email="marrisonbanda64@gmail.com",
            assigned_by_name="Marrison Banda",
            admin_notes="Please verify this task appears in your list",
            tags=["test", "verification"]
        )
        created_task = await create_task(body=new_task_data, db=db)
        print(f"   Created task: {created_task.id}")
        print(f"     Title: {created_task.title}")
        print(f"     Assigned to: {created_task.assigned_to_email}")
        print(f"     Status: {created_task.status}")

        # Test 5: Verify the new task appears in filtered list
        print("\n5. Verifying new task appears in filtered list...")
        kupa_tasks_after = await list_tasks(assigned_to="knyanguru@cut.ac.zw", db=db)
        print(f"   Found {len(kupa_tasks_after)} tasks for knyanguru@cut.ac.zw (was {len(kupa_tasks)})")

        # Test 6: Update the task
        print("\n6. Testing update_task()...")
        update_data = TaskUpdate(
            technician_notes="I have started working on this task",
            status="in_progress"
        )
        updated_task = await update_task(task_id=created_task.id, body=update_data, db=db)
        print(f"   Updated task: {updated_task.id}")
        print(f"     Status: {updated_task.status}")
        print(f"     Technician notes: {updated_task.technician_notes}")
        print(f"     Updated at: {updated_task.updated_at}")

        # Test 7: Verify updated_at changed
        print("\n7. Verifying updated_at timestamp changed...")
        original_updated = created_task.updated_at
        new_updated = updated_task.updated_at
        print(f"     Original updated_at: {original_updated}")
        print(f"     New updated_at:      {new_updated}")
        if original_updated != new_updated:
            print(f"     ✓ Timestamp changed correctly!")
        else:
            print(f"     ✗ WARNING: Timestamp did NOT change!")

        # Clean up test task
        result = await db.execute(select(TaskORM).where(TaskORM.id == created_task.id))
        task_obj = result.scalars().first()
        if task_obj:
            await db.delete(task_obj)
            await db.commit()
            print(f"\n8. Cleaned up test task {created_task.id}")

    print("\n" + "=" * 80)
    print("ALL TESTS COMPLETED")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_endpoints())
