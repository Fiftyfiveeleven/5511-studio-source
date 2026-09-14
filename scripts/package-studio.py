"""Package only Studio source for a dedicated GitHub repository; exclude local data and secrets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
files = ['.gitignore', '.env.example', 'README.md', 'package.json', 'pnpm-lock.yaml',
         'pnpm-workspace.yaml', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json']
for directory in ['src', 'public', 'supabase', 'tests', 'docs', 'scripts']:
    files += [str(p.relative_to(root)) for p in (root / directory).rglob('*')
              if p.is_file() and not p.is_symlink() and not any(
                  part.startswith('.') or part == '__pycache__' for part in p.relative_to(root).parts)]
output = root / 'dist' / '5511-studio-source.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in sorted(set(files)):
        archive.write(root / name, name)
print(f'Created {output} ({len(set(files))} files)')
