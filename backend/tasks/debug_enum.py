"""
Debug script to understand how SQLAlchemy is handling the enum types.
"""
import asyncio
from sqlalchemy import create_engine, MetaData, inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

async def debug_enums():
    """Check what enum types SQLAlchemy is seeing."""
    engine = create_async_engine(
        "postgresql+asyncpg://postgres:root@localhost:5432/aitrms",
        echo=True  # Show SQL statements
    )

    async with engine.begin() as conn:
        # Check existing types in database
        result = await conn.execute(text("""
            SELECT typname, oid FROM pg_type
            WHERE typname IN ('task_status', 'task_priority', 'task_category')
            ORDER BY typname;
        """))
        print("\n=== Enum types in database ===")
        for row in result:
            print(f"  {row.typname} (OID: {row.oid})")

        # Check enum values
        for enum_name in ['task_status', 'task_priority', 'task_category']:
            result = await conn.execute(text(f"""
                SELECT enumlabel FROM pg_enum
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = '{enum_name}')
                ORDER BY enumsortorder;
            """))
            print(f"\n=== Values for {enum_name} ===")
            for row in result:
                print(f"  '{row.enumlabel}'")

    await engine.dispose()

    # Now test the ORM model
    print("\n\n=== Testing ORM Model ===")
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from tasks.task_db_model import TaskORM, TaskCategoryDB, TaskPriorityDB, TaskStatusDB

    print(f"TaskCategoryDB enum values:")
    for member in TaskCategoryDB:
        print(f"  {member.name} = '{member.value}'")

    print(f"\nTaskPriorityDB enum values:")
    for member in TaskPriorityDB:
        print(f"  {member.name} = '{member.value}'")

    print(f"\nTaskStatusDB enum values:")
    for member in TaskStatusDB:
        print(f"  {member.name} = '{member.value}'")

    # Check the column types
    print(f"\nTaskORM.category column: {TaskORM.category.type}")
    print(f"TaskORM.priority column: {TaskORM.priority.type}")
    print(f"TaskORM.status column: {TaskORM.status.type}")

if __name__ == "__main__":
    asyncio.run(debug_enums())
