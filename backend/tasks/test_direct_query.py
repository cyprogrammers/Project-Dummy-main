"""
Test direct database queries to isolate the issue.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from db.database import AsyncSessionLocal
from sqlalchemy import select
from tasks.task_model import TaskORM

async def test_queries():
    """Test various query patterns."""
    print("=" * 80)
    print("TESTING DIRECT DATABASE QUERIES")
    print("=" * 80)

    async with AsyncSessionLocal() as db:
        # Test 1: Select all tasks
        print("\n1. Testing select all tasks...")
        q = select(TaskORM).order_by(TaskORM.created_at.desc())
        result = await db.execute(q)
        tasks = result.scalars().all()
        print(f"   Found {len(tasks)} tasks")

        # Test 2: Select with filter on assigned_to_email
        print("\n2. Testing filter by assigned_to_email='tech@cut.ac.zw'...")
        q = select(TaskORM).where(TaskORM.assigned_to_email == "tech@cut.ac.zw")
        result = await db.execute(q)
        tech_tasks = result.scalars().all()
        print(f"   Found {len(tech_tasks)} tasks")
        for t in tech_tasks[:2]:
            print(f"     - {t.id}: {t.title}")

        # Test 3: Select with filter on status
        print("\n3. Testing filter by status='pending'...")
        q = select(TaskORM).where(TaskORM.status == "pending")
        result = await db.execute(q)
        pending_tasks = result.scalars().all()
        print(f"   Found {len(pending_tasks)} pending tasks")

        # Test 4: Combined filters
        print("\n4. Testing combined filters (assigned_to + status)...")
        q = select(TaskORM).where(
            TaskORM.assigned_to_email == "tech@cut.ac.zw",
            TaskORM.status == "pending"
        )
        result = await db.execute(q)
        combined_tasks = result.scalars().all()
        print(f"   Found {len(combined_tasks)} tasks")

        # Test 5: Conditional filter (like in list_tasks)
        print("\n5. Testing conditional filter building...")
        q = select(TaskORM)
        assigned_to = "knyanguru@cut.ac.zw"
        status = None

        if assigned_to:
            q = q.where(TaskORM.assigned_to_email == assigned_to)
        if status:
            q = q.where(TaskORM.status == status)

        result = await db.execute(q)
        filtered_tasks = result.scalars().all()
        print(f"   Found {len(filtered_tasks)} tasks for knyanguru@cut.ac.zw")
        for t in filtered_tasks:
            print(f"     - {t.id}: {t.title} | Status: {t.status}")

        # Test 6: Check the actual column types
        print("\n6. Checking TaskORM column types...")
        print(f"   category type: {TaskORM.category.type}")
        print(f"   priority type: {TaskORM.priority.type}")
        print(f"   status type: {TaskORM.status.type}")

    print("\n" + "=" * 80)
    print("ALL TESTS COMPLETED")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_queries())
