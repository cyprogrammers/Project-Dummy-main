"""
Verify that the tasks migration has been applied correctly.
"""
import asyncio
import asyncpg

async def check_migration():
    """Check if the tasks table and enum types exist."""
    conn = await asyncpg.connect(
        user='postgres',
        password='root',
        database='aitrms',
        host='localhost',
        port=5432
    )

    try:
        # Check if enum types exist
        print("Checking enum types...")
        types_query = """
            SELECT typname FROM pg_type
            WHERE typname IN ('task_status', 'task_priority', 'task_category')
            ORDER BY typname;
        """
        types = await conn.fetch(types_query)
        print(f"Found {len(types)} enum types:")
        for t in types:
            print(f"  - {t['typname']}")

        # Check if tasks table exists
        print("\nChecking tasks table...")
        table_query = """
            SELECT column_name, data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = 'tasks'
            ORDER BY ordinal_position;
        """
        columns = await conn.fetch(table_query)
        print(f"Tasks table has {len(columns)} columns:")
        for col in columns:
            print(f"  - {col['column_name']}: {col['udt_name']}")

        # Check count
        count = await conn.fetchval("SELECT COUNT(*) FROM tasks")
        print(f"\nTasks table contains {count} rows.")

        if len(types) == 3 and len(columns) > 0:
            print("\n[OK] Migration verified successfully!")
            return 0
        else:
            print("\n[WARNING] Migration may be incomplete.")
            return 1

    except Exception as e:
        print(f"[ERROR] Check failed: {e}")
        return 1
    finally:
        await conn.close()

if __name__ == "__main__":
    exit_code = asyncio.run(check_migration())
