"""Offline regression tests; no real bot, credentials, or messages are used."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sync = load("sync_telegram")
package = load("build_public_site")
CHAT = -100123


def update(identifier, text="Announcement\nDetails", edited=False, **extra):
    message = {"message_id": identifier, "date": 1800000000 + identifier, "chat": {"id": CHAT}, "text": text, **extra}
    return {"update_id": 1000 + identifier, "edited_channel_post" if edited else "channel_post": message}


class FakeTelegram:
    def __init__(self, updates=(), webhook=""):
        self.updates = list(updates)
        self.webhook = webhook
        self.calls = []

    def call(self, method, **parameters):
        self.calls.append((method, parameters))
        return {
            "getWebhookInfo": {"url": self.webhook},
            "getChat": {"id": CHAT, "username": "BonaLabs", "type": "channel"},
            "getMe": {"id": 42},
            "getChatMember": {"status": "administrator"},
            "getUpdates": self.updates,
        }[method]

    def save_photo(self, photo, message_id, root):
        return f"assets/telegram/{message_id}-example.jpg"


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def feed(self):
        return sync.read_json(self.root / "data/telegram-feed.json", {})

    def test_new_posts_edits_and_retry_are_idempotent(self):
        client = FakeTelegram([update(1), update(2)])
        sync.sync(self.root, client)
        self.assertEqual([p["id"] for p in self.feed()["posts"]], [2, 1])
        self.assertEqual([p for m, p in client.calls if m == "getUpdates"], [{"timeout": 0, "limit": 100, "allowed_updates": ["channel_post", "edited_channel_post"]}])
        # The next run alone acknowledges the persisted cursor.
        client.calls.clear()
        sync.sync(self.root, client)
        self.assertEqual([p["offset"] for m, p in client.calls if m == "getUpdates"], [1003])
        client.updates = [{**update(1, "Corrected", edited=True, edit_date=1800000100), "update_id": 1003}]
        sync.sync(self.root, client)
        self.assertEqual([p["id"] for p in self.feed()["posts"]], [2, 1])
        self.assertEqual(self.feed()["posts"][1]["text"], "Corrected")
        self.assertIn("edited_at", self.feed()["posts"][1])

    def test_empty_poll_preserves_files_without_timestamp_churn(self):
        sync.sync(self.root, FakeTelegram([update(1)]))
        paths = [self.root / "data/telegram-feed.json", self.root / ".github/telegram-state.json"]
        before = [p.read_bytes() for p in paths]
        sync.sync(self.root, FakeTelegram())
        self.assertEqual([p.read_bytes() for p in paths], before)

    def test_other_channels_and_service_events_are_not_published(self):
        other = update(2, chat={"id": 77})
        service = update(3, text="", new_chat_title="Ignore")
        sync.sync(self.root, FakeTelegram([update(1, author_signature="Private metadata"), other, service]))
        self.assertEqual([p["id"] for p in self.feed()["posts"]], [1])
        self.assertNotIn("Private metadata", json.dumps(self.feed()))

    def test_albums_group_and_manual_removal_hides_entire_album(self):
        client = FakeTelegram([update(1, "Album caption", media_group_id="album"), update(2, "", media_group_id="album", photo=[{"width": 10, "height": 10}])])
        sync.sync(self.root, client)
        self.assertEqual(len(self.feed()["posts"]), 1)
        self.assertEqual(self.feed()["posts"][0]["text"], "Album caption")
        self.assertEqual(self.feed()["posts"][0]["image"], "assets/telegram/2-example.jpg")
        sync.write_json(self.root / ".github/telegram-hidden-posts.json", [2])
        sync.sync(self.root, FakeTelegram())
        self.assertEqual(self.feed()["posts"], [])

    def test_rich_message_text_captions_and_nested_photos(self):
        blocks = [
            {"type": "heading", "text": [{"type": "bold", "text": "Rich title"}]},
            {"type": "paragraph", "text": ["Text ", {"type": "custom_emoji", "alternative_text": "star"}]},
            {"type": "collage", "blocks": [{"type": "photo", "photo": [{"width": 2, "height": 2}], "caption": {"text": "Caption"}}]},
            {"type": "list", "items": [{"blocks": [{"type": "paragraph", "text": "List item"}]}]},
        ]
        sync.sync(self.root, FakeTelegram([update(1, "", rich_message={"blocks": blocks})]))
        post = self.feed()["posts"][0]
        self.assertEqual(post["text"], "Rich title\nText star\nCaption\nList item")
        self.assertIn("image", post)

    def test_photo_failure_keeps_text_and_spoilers_are_not_downloaded(self):
        client = FakeTelegram([update(1, photo=[{"width": 2, "height": 2}])])
        with patch.object(client, "save_photo", side_effect=sync.SyncError("Unavailable")):
            sync.sync(self.root, client)
        self.assertNotIn("image", self.feed()["posts"][0])
        client.updates = [update(2, has_media_spoiler=True, photo=[{"width": 2, "height": 2}])]
        with patch.object(client, "save_photo") as download:
            sync.sync(self.root, client)
            download.assert_not_called()

    def test_existing_webhook_is_left_untouched(self):
        client = FakeTelegram(webhook="https://example.org/hook")
        with self.assertRaises(sync.SyncError):
            sync.sync(self.root, client)
        self.assertEqual([m for m, _ in client.calls], ["getWebhookInfo"])
        self.assertFalse((self.root / "data").exists())

    def test_api_errors_never_disclose_token(self):
        client = sync.Telegram("123:secret_token")
        with patch.object(sync, "urlopen", side_effect=URLError("https://api.telegram.org/bot123:secret_token/getUpdates")):
            with self.assertRaises(sync.SyncError) as error:
                client.call("getUpdates")
        self.assertNotIn("secret_token", str(error.exception))

    def test_photo_is_cached_with_public_local_path(self):
        client = sync.Telegram("123:secret_token")
        photo = {"file_unique_id": "unique", "file_id": "private-id"}
        with patch.object(client, "call", return_value={"file_path": "photos/file.jpg"}) as call:
            with patch.object(sync, "urlopen") as download:
                download.return_value.__enter__.return_value.read.return_value = b"\xff\xd8\xffphoto"
                path = client.save_photo(photo, 1, self.root)
                self.assertTrue((self.root / path).exists())
                self.assertEqual(client.save_photo(photo, 1, self.root), path)
                self.assertEqual(call.call_count, 1)
                self.assertEqual(download.call_count, 1)
                self.assertNotIn("secret_token", path)

    def test_public_packaging_excludes_private_files(self):
        for name in package.ROOT_FILES:
            (self.root / name).write_text("public", encoding="utf-8")
        for name in ("local-tools/private.html", ".github/telegram-state.json", "preview-test.png", "importer.html"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("private", encoding="utf-8")
        with patch.object(package.subprocess, "run") as git:
            git.return_value.stdout = b"index.html\0"
            destination = self.root / "output"
            package.build(self.root, destination)
        self.assertEqual({p.name for p in destination.iterdir()}, set(package.ROOT_FILES) | {".nojekyll"})

    def test_public_packaging_rejects_tracked_private_tools(self):
        with patch.object(package.subprocess, "run") as git:
            git.return_value.stdout = b"local-tools/private.html\0"
            with self.assertRaisesRegex(ValueError, "Private editorial"):
                package.build(self.root, self.root / "output")


if __name__ == "__main__":
    unittest.main()
