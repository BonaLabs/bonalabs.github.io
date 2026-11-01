"""Offline migration tests. No credentials or live Discord requests."""
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sync_discord as sync
import sync_news

GUILD = "673917009897062411"
CHANNELS = ["1164209144740458506", "1354084517404737586"]
SETTINGS = {"guild_id": GUILD, "channel_ids": CHANNELS, "include_bots": False, "publish_from": None}


def message(n, channel=CHANNELS[0], **extra):
    return {"id": str(1500000000000000000 + n), "channel_id": channel, "type": 0,
            "timestamp": "2026-11-01T12:00:00Z", "content": f"**News {n}**\nDetails",
            "author": {"id": "private-user", "username": "not-for-public-feed"}, **extra}


class FakeDiscord:
    def __init__(self, messages=()):
        self.messages = list(messages)
        self.fail_channel = None
        self.empty_history = False
        self.flags = 1 << 19
        self.calls = []

    def get(self, path, **kwargs):
        self.calls.append(path)
        if path == "/applications/@me":
            return {"flags": self.flags}
        channel = path.split('/')[2]
        if channel == self.fail_channel:
            raise sync.SyncError("Discord request failed (HTTP 403); previous feed preserved.")
        if '/messages?' in path:
            return [] if self.empty_history else [m for m in self.messages if m['channel_id'] == channel]
        if '/messages/' in path:
            return next((m for m in self.messages if m['id'] == path.split('/')[-1]), None)
        return {"id": channel, "guild_id": GUILD, "type": 0}

    def save_image(self, attachment, root):
        return 'assets/discord/example.png'


class DiscordTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.path = self.root / 'data/news-feed.json'

    def run_sync(self, client, settings=None):
        sync.sync(self.root, settings or SETTINGS, client)
        return json.loads(self.path.read_text(encoding='utf-8'))

    def test_two_channels_recent_history_precision_and_no_private_metadata(self):
        client = FakeDiscord([message(1), message(2, CHANNELS[1])])
        feed = self.run_sync(client)
        self.assertEqual([p['id'] for p in feed['posts']], [str(1500000000000000002), str(1500000000000000001)])
        self.assertEqual(feed['posts'][0]['url'], f'https://discord.com/channels/{GUILD}/{CHANNELS[1]}/1500000000000000002')
        self.assertEqual(feed['posts'][0]['text'], 'News 2\nDetails')
        self.assertNotIn('private-user', json.dumps(feed))
        self.assertNotIn('not-for-public-feed', json.dumps(feed))
        before = self.path.read_bytes()
        self.run_sync(client)
        self.assertEqual(self.path.read_bytes(), before)

    def test_edits_deletions_and_backfill_in_both_channels(self):
        client = FakeDiscord([message(n, CHANNELS[n % 2]) for n in range(20)])
        self.assertEqual(len(self.run_sync(client)['posts']), 12)
        client.messages.pop()
        client.messages[-1]['content'] = 'Corrected announcement'
        client.messages[-1]['edited_timestamp'] = '2026-11-01T13:00:00Z'
        posts = self.run_sync(client)['posts']
        self.assertEqual(len(posts), 12)
        self.assertEqual(posts[0]['text'], 'Corrected announcement')
        self.assertIn('edited_at', posts[0])
        self.assertNotIn(message(19)['id'], [p['id'] for p in posts])
        client.messages = []
        self.assertEqual(self.run_sync(client)['posts'], [])

    def test_failed_second_channel_and_missing_intent_preserve_snapshot(self):
        client = FakeDiscord([message(1), message(2, CHANNELS[1])])
        self.run_sync(client)
        before = self.path.read_bytes()
        client.fail_channel = CHANNELS[1]
        with self.assertRaises(sync.SyncError):
            self.run_sync(client)
        self.assertEqual(self.path.read_bytes(), before)
        client.fail_channel = None
        client.flags = 0
        with self.assertRaisesRegex(sync.SyncError, 'Message Content Intent'):
            self.run_sync(client)
        self.assertEqual(self.path.read_bytes(), before)

    def test_empty_history_does_not_masquerade_as_deletion(self):
        client = FakeDiscord([message(1)])
        self.run_sync(client)
        before = self.path.read_bytes()
        client.empty_history = True
        with self.assertRaisesRegex(sync.SyncError, 'incomplete history'):
            self.run_sync(client)
        self.assertEqual(self.path.read_bytes(), before)

    def test_initial_empty_feed_cannot_replace_telegram(self):
        sync.write_json(self.path, {'schema_version': 1, 'source': 'telegram', 'posts': [{'id': 44}]})
        before = self.path.read_bytes()
        with self.assertRaisesRegex(sync.SyncError, 'no eligible announcements'):
            self.run_sync(FakeDiscord())
        self.assertEqual(self.path.read_bytes(), before)

    def test_filters_media_spoilers_and_cutoff(self):
        client = FakeDiscord([
            message(1), message(2, author={'bot': True}), message(3, type=6),
            message(4, webhook_id='private-webhook'),
            message(5, content='', attachments=[{'filename': 'photo.png', 'content_type': 'image/png'}]),
            message(6, content='Title\n||secret|| <@123> <:star:123>', attachments=[{'filename': 'SPOILER_test.png', 'content_type': 'image/png'}]),
        ])
        posts = self.run_sync(client)['posts']
        self.assertEqual([p['id'] for p in posts], [message(6)['id'], message(5)['id'], message(1)['id']])
        self.assertNotIn('image', posts[0])
        self.assertNotIn('secret', posts[0]['text'])
        self.assertEqual(posts[1]['image'], 'assets/discord/example.png')
        with patch.object(client, 'save_image', side_effect=sync.SyncError('Unavailable')):
            self.assertNotIn('image', self.run_sync(client)['posts'][1])
        client.messages = [message(7, timestamp='2026-11-01T12:00:00.100Z'), message(8, timestamp='2026-10-31T23:00:00Z')]
        settings = {**SETTINGS, 'publish_from': '2026-11-01T12:00:00Z'}
        self.assertEqual([p['id'] for p in self.run_sync(client, settings)['posts']], [message(7)['id']])

    def test_wrong_guild_and_invalid_settings_are_rejected(self):
        client = FakeDiscord([message(1)])
        for settings in ({**SETTINGS, 'guild_id': '1'}, {**SETTINGS, 'channel_ids': CHANNELS * 2},
                         {**SETTINGS, 'publish_from': '2026-11-01'}, {**SETTINGS, 'include_bots': 'false'},
                         {**SETTINGS, 'guild_id': '673917009897062412'}):
            with self.assertRaises(sync.SyncError):
                self.run_sync(client, settings)
        self.assertFalse(self.path.exists())

    def test_api_errors_only_unknown_message_is_treated_as_deleted(self):
        client = sync.Discord('dummy-secret')
        for status, code in [(403, 50013), (429, 0), (500, 0), (404, 10003)]:
            error = HTTPError('url', status, 'error', {}, BytesIO(json.dumps({'code': code}).encode()))
            with patch.object(client.opener, 'open', side_effect=error):
                with self.assertRaises(sync.SyncError):
                    client.get('/channels/1/messages/2', allow_deleted=True)
        error = HTTPError('url', 404, 'error', {}, BytesIO(b'{"code":10008}'))
        with patch.object(client.opener, 'open', side_effect=error):
            self.assertIsNone(client.get('/channels/1/messages/2', allow_deleted=True))
        with patch.object(client.opener, 'open', side_effect=URLError('dummy-secret')):
            with self.assertRaises(sync.SyncError) as result:
                client.get('/applications/@me')
            self.assertNotIn('dummy-secret', str(result.exception))

    def test_image_cache_ignores_expiring_query_and_never_sends_token(self):
        client = sync.Discord('dummy-secret')
        photo = {'url': 'https://cdn.discordapp.com/attachments/123/456/image.png?ex=old', 'size': 30}
        with patch.object(client.opener, 'open') as download:
            download.return_value.__enter__.return_value.read.return_value = b'\x89PNG\r\n\x1a\nimage'
            path = client.save_image(photo, self.root)
            self.assertTrue((self.root / path).exists())
            self.assertNotIn('Authorization', download.call_args.args[0].headers)
            self.assertEqual(client.save_image({**photo, 'url': photo['url'].replace('old', 'new')}, self.root), path)
            self.assertEqual(download.call_count, 1)
        for url in ('http://cdn.discordapp.com/attachments/x', 'https://evil.test/attachments/x',
                    'https://cdn.discordapp.com@evil.test/attachments/x'):
            with self.assertRaises(sync.SyncError):
                client.save_image({'url': url}, self.root)

    def test_source_selection_calls_only_the_active_provider(self):
        config = self.root / '.github/news-feed-settings.json'
        sync.write_json(config, {'source': 'discord', 'discord': SETTINGS})
        with patch.object(sync_news.sync_discord, 'sync') as discord, patch.object(sync_news.sync_telegram, 'sync') as telegram:
            sync_news.sync(self.root)
            discord.assert_called_once_with(self.root, SETTINGS)
            telegram.assert_not_called()
        sync.write_json(config, {'source': 'telegram'})
        sync.write_json(self.root / 'data/telegram-feed.json', {'schema_version': 1, 'posts': [{'id': 44}]})
        with patch.object(sync_news.sync_discord, 'sync') as discord, patch.object(sync_news.sync_telegram, 'sync'):
            sync_news.sync(self.root)
            discord.assert_not_called()
            self.assertEqual(json.loads(self.path.read_text())['source'], 'telegram')


if __name__ == '__main__':
    unittest.main()
