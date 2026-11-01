"""One active news source. Keep the previous feed if synchronization fails."""
import sys
from pathlib import Path

import sync_telegram
import sync_discord
from sync_telegram import SyncError, read_json, write_json


def sync(root):
    settings = read_json(root / ".github/news-feed-settings.json", {"source": "telegram"})
    source = settings.get("source")
    if source == "discord":
        sync_discord.sync(root, settings.get("discord", {}))
    elif source == "telegram":
        sync_telegram.sync(root)
        feed = read_json(root / "data/telegram-feed.json", {})
        write_json(root / "data/news-feed.json", {**feed, "source": "telegram"})
    else:
        raise SyncError("News source must be telegram or discord.")


if __name__ == "__main__":
    try:
        sync(Path(__file__).resolve().parents[2])
    except (SyncError, OSError, ValueError, TypeError, KeyError) as error:
        # Never print unexpected payloads, credentials or HTTP response bodies.
        print(str(error) if isinstance(error, SyncError) else "News synchronization failed; previous feed preserved.", file=sys.stderr)
        sys.exit(1)
