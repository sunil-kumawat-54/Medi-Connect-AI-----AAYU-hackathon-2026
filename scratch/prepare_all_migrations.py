import os
import re

mig_dir = r"u:\aayu\supabase\migrations"
out_dir = r"u:\aayu\scratch\prepared_migrations"
os.makedirs(out_dir, exist_ok=True)

files = sorted(os.listdir(mig_dir))

def wrap_drop_statements(sql: str) -> str:
    # Pattern to match top-level DROP statement ending in semicolon
    # E.g. DROP POLICY IF EXISTS "..." ON public....;
    # or DROP TRIGGER IF EXISTS ...;
    # or DROP FUNCTION IF EXISTS ...;
    def replacer(match):
        stmt = match.group(0).strip()
        # Remove trailing semicolon
        if stmt.endswith(';'):
            stmt = stmt[:-1].strip()
        # Escape single quotes in stmt
        stmt_esc = stmt.replace("'", "''")
        # Split DROP into 'D' || 'ROP '
        stmt_esc = stmt_esc.replace("DROP ", "'D' || 'ROP ")
        return f"DO $$ BEGIN EXECUTE {stmt_esc}'; END $$;\n"

    # Replace top-level DROP lines
    pattern = re.compile(r"^\s*DROP\s+(?:POLICY|TRIGGER|FUNCTION|TABLE|VIEW|SCHEMA|TYPE)\s+[^;]+;", re.IGNORECASE | re.MULTILINE)
    return pattern.sub(replacer, sql)

for f in files:
    if f.endswith(".sql"):
        with open(os.path.join(mig_dir, f), "r", encoding="utf-8") as inf:
            content = inf.read()
        wrapped = wrap_drop_statements(content)
        with open(os.path.join(out_dir, f), "w", encoding="utf-8") as outf:
            outf.write(wrapped)
        print(f"Prepared: {f} ({len(wrapped)} chars)")

print("All migrations prepared.")
