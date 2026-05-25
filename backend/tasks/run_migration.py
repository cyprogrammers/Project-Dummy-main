"""
Quick migration runner for tasks table setup.
Reads migration_tasks.sql and executes it against the PostgreSQL database.
"""
import asyncio
import asyncpg
import sys
from pathlib import Path

async def run_migration():
    """Execute the migration SQL file."""
    # Read the migration SQL
    migration_file = Path(__file__).parent / "migration_tasks.sql"
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    # Connect to database
    # Default connection from config.py: postgresql+asyncpg://postgres:root@localhost:5432/aitrms
    # asyncpg doesn't use the +asyncpg prefix
    conn = await asyncpg.connect(
        user='postgres',
        password='root',
        database='aitrms',
        host='localhost',
        port=5432
    )

    try:
        # Execute the migration
        print("Running migration_tasks.sql...")
        await conn.execute(sql)
        print("[OK] Migration completed successfully!")
        print("  - Created enum types: task_status, task_priority, task_category")
        print("  - Created tasks table with indexes and triggers")
        return 0
    except Exception as e:
        print(f"[ERROR] Migration failed: {e}", file=sys.stderr)
        return 1
    finally:
        await conn.close()

if __name__ == "__main__":
    exit_code = asyncio.run(run_migration())
    sys.exit(exit_code)
