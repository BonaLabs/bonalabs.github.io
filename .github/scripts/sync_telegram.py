"""Read one durable batch from a dedicated Telegram bot. Standard library only."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CHANNEL = "BonaLabs"
MAX_MESSAGES = 40
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class SyncError(Exception):
    pass


def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_json(path, value):
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    temporary.replace(path)


def iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


def rich_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(rich_text(item) for item in value)
    if isinstance(value, dict):
        if value.get("type") == "spoiler":
            return "[Spoiler: view on Telegram]"
        return rich_text(value.get("text", value.get("alternative_text", value.get("expression", ""))))
    return ""


def rich_blocks(blocks):
    lines = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        for key in ("text", "expression"):
            if key in block:
                lines.append(rich_text(block[key]))
        if block.get("caption"):
            lines.append(rich_text(block["caption"].get("text", "")))
        lines.append(rich_blocks(block.get("blocks", [])))
        for item in block.get("items", []):
            lines.append(rich_blocks(item.get("blocks", [])))
        for row in block.get("rows", []):
            lines.append(" | ".join(rich_text(cell.get("text", "")) for cell in row.get("cells", [])))
    return "\n".join(line.strip() for line in lines if line.strip())


def rich_photos(blocks):
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if not block.get("has_spoiler"):
            yield from block.get("photo", [])
            yield from rich_photos(block.get("blocks", []))


def normalize(message, client, root):
    # Explicitly select display fields: never publish raw API updates or user data.
    text = message.get("text") or message.get("caption") or rich_blocks(message.get("rich_message", {}).get("blocks", []))
    if not text and message.get("poll"):
        text = message["poll"].get("question", "")
    content_keys = ("photo", "video", "animation", "document", "audio", "voice", "video_note", "sticker", "paid_media", "rich_message")
    if not text and not any(key in message for key in content_keys):
        return None  # Channel service events are not announcements.
    record = {
        "id": message["message_id"],
        "published_at": iso(message["date"]),
        "text": str(text or "New media from BonaLabs\nOpen this post on Telegram to view the attachment.").strip()[:12000],
    }
    if message.get("edit_date"):
        record["edited_at"] = iso(message["edit_date"])
    if message.get("media_group_id"):
        record["album"] = str(message["media_group_id"])
    photos = [] if message.get("has_media_spoiler") else message.get("photo", [])
    photos = photos + list(rich_photos(message.get("rich_message", {}).get("blocks", [])))
    if photos:
        photo = max(photos, key=lambda p: p.get("width", 0) * p.get("height", 0))
        try:
            record["image"] = client.save_photo(photo, record["id"], root)
        except SyncError:
            # A missing thumbnail must not suppress the announcement itself.
            print(f"Thumbnail unavailable for post {record['id']}; publishing its text and link.")
    return record


def make_posts(messages, hidden):
    groups = {}
    for record in sorted(messages, key=lambda m: m["id"]):
        key = "album:" + record["album"] if record.get("album") else str(record["id"])
        groups.setdefault(key, []).append(record)
    posts = []
    for members in groups.values():
        if any(member["id"] in hidden for member in members):
            continue
        first = members[0]
        texts = list(dict.fromkeys(m["text"] for m in members if not m["text"].startswith("New media from BonaLabs\n")))
        post = {
            "id": first["id"],
            "published_at": first["published_at"],
            "text": "\n".join(texts)[:12000] if texts else first["text"],
        }
        edited = [m["edited_at"] for m in members if m.get("edited_at")]
        if edited:
            post["edited_at"] = max(edited)
        image = next((m["image"] for m in members if m.get("image")), None)
        if image:
            post["image"] = image
        posts.append(post)
    return sorted(posts, key=lambda p: (p["published_at"], p["id"]), reverse=True)[:12]


class Telegram:
    def __init__(self, token):
        if not token or not re.fullmatch(r"\d+:[A-Za-z0-9_-]+", token):
            raise SyncError("Set TELEGRAM_BOT_TOKEN to a valid dedicated bot token.")
        self.token = token

    def call(self, method, **parameters):
        request = Request(
            f"https://api.telegram.org/bot{self.token}/{method}",
            data=json.dumps(parameters).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urlopen(request, timeout=25) as response:
                body = response.read(4 * 1024 * 1024 + 1)
            if len(body) > 4 * 1024 * 1024:
                raise SyncError("Telegram response exceeds the size limit.")
            payload = json.loads(body)
        except HTTPError as error:
            raise SyncError(f"Telegram {method} failed (HTTP {error.code}).") from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise SyncError(f"Telegram {method} could not be read; existing news is unchanged.") from None
        if not payload.get("ok"):
            raise SyncError(f"Telegram rejected {method}.")
        return payload["result"]

    def save_photo(self, photo, message_id, root):
        digest = hashlib.sha256(photo["file_unique_id"].encode()).hexdigest()[:16]
        directory = root / "assets" / "telegram"
        stem = f"{message_id}-{digest}"
        for extension in ("jpg", "png", "webp"):
            cached = directory / f"{stem}.{extension}"
            if cached.exists():
                return cached.relative_to(root).as_posix()
        info = self.call("getFile", file_id=photo["file_id"])
        file_path = info.get("file_path", "")
        if not re.fullmatch(r"[A-Za-z0-9_./-]+", file_path) or ".." in file_path:
            raise SyncError("Unsupported Telegram file path.")
        if info.get("file_size", 0) > MAX_IMAGE_BYTES:
            raise SyncError("Thumbnail is too large.")
        try:
            with urlopen(f"https://api.telegram.org/file/bot{self.token}/{file_path}", timeout=25) as response:
                content = response.read(MAX_IMAGE_BYTES + 1)
        except (URLError, TimeoutError, OSError):
            raise SyncError("Telegram thumbnail download failed.") from None
        extension = "jpg" if content.startswith(b"\xff\xd8\xff") else "png" if content.startswith(b"\x89PNG\r\n\x1a\n") else "webp" if content[:4] == b"RIFF" and content[8:12] == b"WEBP" else None
        if not extension or len(content) > MAX_IMAGE_BYTES:
            raise SyncError("Unsupported thumbnail format or size.")
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"{stem}.{extension}"
        destination.write_bytes(content)
        return destination.relative_to(root).as_posix()


def feed_settings(root):
    settings = read_json(root / ".github" / "telegram-feed-settings.json", {"enabled": True})
    if type(settings.get("enabled")) is not bool:
        raise SyncError("Telegram feed settings require an enabled boolean.")
    if not settings["enabled"]:
        return False, None
    start = settings.get("publish_from")
    # Existing installations without a settings file keep their original behavior.
    if start is None and not (root / ".github" / "telegram-feed-settings.json").exists():
        return True, None
    try:
        cutoff = datetime.fromisoformat(start.replace("Z", "+00:00"))
        if cutoff.tzinfo is None:
            raise ValueError
    except (AttributeError, TypeError, ValueError):
        raise SyncError("Set publish_from to the reactivation time, including its timezone.") from None
    return True, cutoff.timestamp()


def sync(root, client=None):
    state_path = root / ".github" / "telegram-state.json"
    feed_path = root / "data" / "telegram-feed.json"
    state = read_json(state_path, {"messages": []})
    enabled, cutoff = feed_settings(root)
    if not enabled:
        state["messages"] = []
        write_json(feed_path, {"schema_version": 1, "channel": CHANNEL, "updated_at": None, "posts": []})
        write_json(state_path, state)
        print("Telegram news is paused; feed cleared. Bot cursor preserved; no API calls made.")
        return
    if client is None:
        client = Telegram(os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    hidden = set(read_json(root / ".github" / "telegram-hidden-posts.json", []))
    if client.call("getWebhookInfo").get("url"):
        raise SyncError("This bot already has a webhook. Use a dedicated bot; its webhook was not changed.")
    chat = client.call("getChat", chat_id="@" + CHANNEL)
    if chat.get("type") != "channel" or chat.get("username", "").casefold() != CHANNEL.casefold():
        raise SyncError("The configured public channel could not be verified.")
    if state.get("channel_id") not in (None, chat["id"]):
        raise SyncError("Stored channel identity differs; review the state before continuing.")
    bot = client.call("getMe")
    membership = client.call("getChatMember", chat_id=chat["id"], user_id=bot["id"])
    if membership.get("status") not in ("administrator", "member", "creator"):
        raise SyncError("Add the dedicated bot to the BonaLabs channel first.")
    parameters = {"timeout": 0, "limit": 100, "allowed_updates": ["channel_post", "edited_channel_post"]}
    if state.get("bot_id") == bot["id"] and state.get("next_update_id") is not None:
        parameters["offset"] = state["next_update_id"]
    updates = client.call("getUpdates", **parameters)
    records = {
        m["id"]: m for m in state.get("messages", [])
        if cutoff is None or datetime.fromisoformat(m["published_at"].replace("Z", "+00:00")).timestamp() >= cutoff
    }
    for update in sorted(updates, key=lambda u: u["update_id"]):
        message = update.get("channel_post") or update.get("edited_channel_post")
        if not message or message.get("chat", {}).get("id") != chat["id"]:
            continue
        if cutoff is not None and message.get("date", 0) < cutoff:
            continue  # Ignore older posts, including edits delivered after reactivation.
        record = normalize(message, client, root)
        if record:
            records[record["id"]] = record
    messages = sorted(records.values(), key=lambda m: (m["published_at"], m["id"]), reverse=True)[:MAX_MESSAGES]
    new_state = {"schema_version": 1, "channel_id": chat["id"], "bot_id": bot["id"], "messages": messages}
    if updates:
        new_state["next_update_id"] = max(u["update_id"] for u in updates) + 1
    elif "offset" in parameters:
        new_state["next_update_id"] = parameters["offset"]
    posts = make_posts(messages, hidden)
    old_feed = read_json(feed_path, {})
    feed = {"schema_version": 1, "channel": CHANNEL, "updated_at": old_feed.get("updated_at"), "posts": posts}
    if old_feed.get("posts") != posts:
        feed["updated_at"] = iso(datetime.now(timezone.utc).timestamp())
    write_json(feed_path, feed)
    write_json(state_path, new_state)
    # Never acknowledge this batch here. The workflow must commit and push it
    # first; the next run acknowledges only that already-persisted cursor.
    print(f"Received {len(updates)} updates; the public feed contains {len(posts)} posts.")


if __name__ == "__main__":
    try:
        sync(Path(__file__).resolve().parents[2])
    except (SyncError, OSError, ValueError) as error:
        print(f"Sync stopped: {error}", file=sys.stderr)
        sys.exit(1)
