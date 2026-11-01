"""Read recent announcements from explicitly selected Discord channels via REST.

No Gateway connection or raw message archive. Rebuild the snapshot on each poll
so edits/deletions are reflected; API failures never replace the published feed.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

from sync_telegram import SyncError, read_json, write_json

SNOWFLAKE = re.compile(r"[1-9][0-9]{16,19}")
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_POSTS = 12


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Discord:
    def __init__(self, token):
        if not token or any(c.isspace() for c in token):
            raise SyncError("Set DISCORD_BOT_TOKEN to the bot token in GitHub Actions secrets.")
        self.token = token
        self.opener = build_opener(NoRedirect)

    def get(self, path, *, allow_deleted=False):
        request = Request("https://discord.com/api/v10" + path, headers={
            "Authorization": "Bot " + self.token,
            "User-Agent": "DiscordBot (https://bonalabs.net, 1.0)",
            "Accept": "application/json",
        })
        try:
            with self.opener.open(request, timeout=25) as response:
                data = response.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024:
                raise SyncError("Discord response exceeds the size limit.")
            return json.loads(data)
        except HTTPError as error:
            # Only Discord's Unknown Message means deleted. Missing access,
            # missing channel, rate limits and outages must preserve the feed.
            if allow_deleted and error.code == 404:
                try:
                    if json.loads(error.read(4096)).get("code") == 10008:
                        return None
                except (ValueError, AttributeError):
                    pass
            raise SyncError(f"Discord request failed (HTTP {error.code}); previous feed preserved.") from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise SyncError("Discord could not be read; previous feed preserved.") from None

    def save_image(self, attachment, root):
        url = attachment.get("url", "")
        parts = urlsplit(url)
        if (parts.scheme != "https" or parts.hostname not in ("cdn.discordapp.com", "media.discordapp.net")
                or parts.username or parts.password or parts.port not in (None, 443)
                or not parts.path.startswith("/attachments/")
                or attachment.get("size", 0) > MAX_IMAGE_BYTES):
            raise SyncError("Unsupported Discord image URL or size.")
        # Signed query parameters expire. Cache by stable attachment path and
        # never publish the signed URL or send bot credentials to the CDN.
        stem = hashlib.sha256(parts.path.encode()).hexdigest()[:24]
        directory = root / "assets/discord"
        for ext in ("jpg", "png", "webp", "gif"):
            cached = directory / f"{stem}.{ext}"
            if cached.exists():
                return cached.relative_to(root).as_posix()
        try:
            with self.opener.open(Request(url, headers={"User-Agent": "BonaLabs news feed"}), timeout=25) as response:
                data = response.read(MAX_IMAGE_BYTES + 1)
        except (URLError, TimeoutError, OSError):
            raise SyncError("Discord image download failed.") from None
        ext = ("jpg" if data.startswith(b"\xff\xd8\xff") else
               "png" if data.startswith(b"\x89PNG\r\n\x1a\n") else
               "webp" if data[:4] == b"RIFF" and data[8:12] == b"WEBP" else
               "gif" if data[:6] in (b"GIF87a", b"GIF89a") else None)
        if not ext or len(data) > MAX_IMAGE_BYTES:
            raise SyncError("Unsupported Discord image format or size.")
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"{stem}.{ext}"
        destination.write_bytes(data)
        return destination.relative_to(root).as_posix()


def timestamp(value):
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if date.tzinfo is None:
            raise ValueError
        return date.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, AttributeError, ValueError):
        raise SyncError("Discord dates must be valid timestamps with a timezone.") from None


def plain_text(text):
    text = re.sub(r"\|\|[\s\S]*?\|\|", "[Spoiler: view on Discord]", text)
    text = re.sub(r"<a?:([A-Za-z0-9_]+):[0-9]+>", r":\1:", text)
    text = re.sub(r"<@!?[0-9]+>", "@member", text)
    text = re.sub(r"<@&[0-9]+>", "@role", text)
    text = re.sub(r"<#[0-9]+>", "#channel", text)
    text = re.sub(r"\[([^\]]+)\]\(https?://[^\s)]+\)", r"\1", text)
    text = re.sub(r"(?m)^\s{0,3}(?:#{1,3}|>)\s+", "", text)
    text = re.sub(r"(\*\*|__|~~|`{1,3})", "", text)
    return text.strip()[:12000]


def normalize(message, client, root, guild, channel, include_bots):
    if message.get("type", 0) not in (0, 19):
        return None  # Ignore join/pin/system events.
    if not include_bots and (message.get("author", {}).get("bot") or message.get("webhook_id")):
        return None
    identifier = message.get("id", "")
    if not isinstance(identifier, str) or not SNOWFLAKE.fullmatch(identifier) or message.get("channel_id") != channel:
        raise SyncError("Unexpected Discord message identity; previous feed preserved.")
    content = message.get("content", "")
    # Human posts may contain link previews; those are redundant if text exists.
    if not content:
        content = "\n".join(str(e.get(k, "")) for e in message.get("embeds", []) for k in ("title", "description") if e.get(k))
    attachments = message.get("attachments", [])
    if not content and not attachments and not message.get("sticker_items") and not message.get("poll"):
        return None
    if not content and message.get("poll"):
        content = message["poll"].get("question", {}).get("text", "")
    post = {
        "id": identifier, "channel_id": channel,
        "published_at": timestamp(message.get("timestamp")),
        "text": plain_text(content) or "New media from BonaLabs\nOpen this post on Discord to view the attachment.",
        "url": f"https://discord.com/channels/{guild}/{channel}/{identifier}",
    }
    if message.get("edited_timestamp"):
        post["edited_at"] = timestamp(message["edited_timestamp"])
    for attachment in attachments:
        if attachment.get("filename", "").startswith("SPOILER_") or not attachment.get("content_type", "").startswith("image/"):
            continue
        try:
            post["image"] = client.save_image(attachment, root)
            break
        except SyncError:
            print(f"Thumbnail unavailable for Discord post {identifier}; keeping text and link.")
    return post


def sync(root, settings, client=None):
    guild = settings.get("guild_id", "")
    channels = settings.get("channel_ids", [])
    if (not isinstance(guild, str) or not SNOWFLAKE.fullmatch(guild)
            or not isinstance(channels, list) or not 1 <= len(channels) <= 5
            or any(not isinstance(c, str) or not SNOWFLAKE.fullmatch(c) for c in channels)
            or len(set(channels)) != len(channels)
            or type(settings.get("include_bots", False)) is not bool):
        raise SyncError("Configure the Discord guild_id, unique channel_ids and include_bots boolean.")
    cutoff = datetime.fromisoformat(timestamp(settings["publish_from"]).replace("Z", "+00:00")) if settings.get("publish_from") else None
    client = client or Discord(os.environ.get("DISCORD_BOT_TOKEN", ""))
    app = client.get("/applications/@me")
    if not app.get("flags", 0) & ((1 << 18) | (1 << 19)):
        raise SyncError("Enable Message Content Intent for the Discord bot; previous feed preserved.")
    feed_path = root / "data/news-feed.json"
    previous = read_json(feed_path, {})
    records = []
    for channel in channels:
        info = client.get(f"/channels/{channel}")
        if info.get("id") != channel or info.get("guild_id") != guild or info.get("type") not in (0, 5):
            raise SyncError("Discord channel must be a text or announcement channel in the configured server.")
        messages = client.get(f"/channels/{channel}/messages?limit=100")
        if not isinstance(messages, list):
            raise SyncError("Invalid Discord message list; previous feed preserved.")
        # An empty history can also mean READ_MESSAGE_HISTORY was revoked.
        # Confirm each previously displayed message is truly gone before wiping.
        if not messages and previous.get("source") == "discord" and previous.get("guild_id") == guild:
            for old in previous.get("posts", []):
                if old.get("channel_id") == channel and SNOWFLAKE.fullmatch(str(old.get("id", ""))):
                    if client.get(f"/channels/{channel}/messages/{old['id']}", allow_deleted=True) is not None:
                        raise SyncError("Discord returned an incomplete history; previous feed preserved.")
        for message in messages:
            if cutoff and datetime.fromisoformat(timestamp(message.get("timestamp")).replace("Z", "+00:00")) < cutoff:
                continue
            records.append((message, channel))
    # All channel requests must succeed before deriving a replacement snapshot.
    posts = []
    seen = set()
    for message, channel in sorted(records, key=lambda pair: int(pair[0]["id"]), reverse=True):
        if message["id"] in seen:
            continue
        seen.add(message["id"])
        post = normalize(message, client, root, guild, channel, settings.get("include_bots", False))
        if post:
            posts.append(post)
        if len(posts) == MAX_POSTS:
            break
    feed = {"schema_version": 1, "source": "discord", "guild_id": guild,
            "channel_ids": channels, "updated_at": previous.get("updated_at"), "posts": posts}
    if not posts and previous.get("source") != "discord":
        raise SyncError("First Discord sync found no eligible announcements. Check channel history, permissions and filters before switching.")
    if any(previous.get(key) != feed[key] for key in ("source", "guild_id", "channel_ids", "posts")):
        feed["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    write_json(feed_path, feed)
    print(f"Read {len(channels)} Discord channels; public feed contains {len(posts)} posts.")


if __name__ == "__main__":
    raise SystemExit("Run sync_news.py to use the configured source.")
