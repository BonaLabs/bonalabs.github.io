"""Package only approved public files; private editorial tools never enter Pages."""
from pathlib import Path
import shutil
import subprocess

ROOT_FILES = (
    "index.html", "calculator.html", "xp-calculator.html", "style.css", "post.css",
    "site.js", "xp-calculator.js", "telegram-news.js", "robots.txt", "sitemap.xml",
    "CNAME", "favicon.png", "logo-mark.png",
)


def build(root, destination):
    tracked = subprocess.run(["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True).stdout.decode().split("\0")
    if any(name.startswith("local-tools/") or name == "importer.html" for name in tracked):
        raise ValueError("Private editorial utilities are tracked; refusing to publish.")
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Use an empty output directory.")
    files = [root / name for name in ROOT_FILES]
    for name in ("articles", "icons", "assets", "data"):
        files.extend(p for p in (root / name).rglob("*") if p.is_file() and not any(part.startswith(".") for part in p.relative_to(root).parts))
    for source in files:
        relative = source.relative_to(root)
        if source.is_symlink() or not source.resolve().is_relative_to(root.resolve()):
            raise ValueError("Public file resolves outside the site.")
        if source.suffix in (".html", ".css", ".js", ".json", ".xml", ".txt"):
            text = source.read_text(encoding="utf-8")
            if "local-tools/" in text or "importer.html" in text:
                raise ValueError(f"Private utility reference in {relative}.")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    (destination / ".nojekyll").touch()
    print(f"Packaged {len(files)} public files.")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    build(root, root / "_site")
