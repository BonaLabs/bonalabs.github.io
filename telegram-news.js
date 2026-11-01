(() => {
  const section = document.querySelector('[data-telegram-news]');
  if (!section || section.hidden) return;

  const feed = section.querySelector('[data-telegram-feed]');
  const empty = section.querySelector('[data-telegram-empty]');
  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
  let lastContent = '';
  let loading = false;
  const snowflake = (value) => typeof value === 'string' && /^[1-9][0-9]{16,19}$/.test(value);

  const sourceDetails = (data) => {
    if (data.source === 'discord' && snowflake(data.guild_id)
      && Array.isArray(data.channel_ids) && data.channel_ids.length > 0 && data.channel_ids.every(snowflake)) {
      return { key: 'discord', label: 'Discord', join: 'https://discord.com/invite/RKMz5gC',
        valid: (post) => snowflake(post.id) && data.channel_ids.includes(post.channel_id),
        url: (post) => `https://discord.com/channels/${data.guild_id}/${post.channel_id}/${post.id}` };
    }
    if (data.source && data.source !== 'telegram') throw new Error('Unknown source');
    return { key: 'telegram', label: 'Telegram', join: 'https://t.me/BonaLabs',
      valid: (post) => Number.isSafeInteger(post.id) && post.id > 0,
      url: (post) => `https://t.me/BonaLabs/${post.id}` };
  };

  const createCard = (post, source) => {
    const item = document.createElement('li');
    const article = document.createElement('article');
    article.className = 'telegram-news-card';

    if (typeof post.image === 'string' && /^assets\/(telegram|discord)\/[\w-]+\.(jpg|png|webp|gif)$/.test(post.image)) {
      const image = document.createElement('img');
      image.className = 'telegram-news-image';
      image.src = post.image;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true });
      article.append(image);
    }

    const copy = document.createElement('div');
    copy.className = 'telegram-news-copy';
    const time = document.createElement('time');
    time.dateTime = post.published_at;
    time.textContent = dateFormat.format(new Date(post.published_at));
    const text = typeof post.text === 'string' ? post.text.trim().slice(0, 12000) : '';
    const lines = text.split(/\n+/);
    const hasTitle = lines[0].length > 0 && lines[0].length <= 110;
    const heading = document.createElement('h3');
    const link = document.createElement('a');
    link.href = source.url(post);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = hasTitle ? lines.shift() : 'Update from BonaLabs';
    heading.append(link);
    copy.append(time, heading);

    const excerpt = hasTitle ? lines.join('\n') : text;
    if (excerpt) {
      const body = document.createElement('p');
      body.className = 'telegram-news-excerpt';
      body.textContent = excerpt;
      copy.append(body);
    }
    const read = document.createElement('a');
    read.href = link.href;
    read.target = '_blank';
    read.rel = 'noopener noreferrer';
    read.className = 'telegram-news-read';
    read.textContent = `Read on ${source.label} →`;
    copy.append(read);
    article.append(copy);
    item.append(article);
    return item;
  };

  const refresh = async () => {
    if (loading || document.hidden) return;
    loading = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      let response = await fetch('data/news-feed.json', {
        cache: 'no-cache', signal: controller.signal
      });
      // Old checkouts retain the Telegram snapshot until the first new build.
      if (response.status === 404) response = await fetch('data/telegram-feed.json', {
        cache: 'no-cache', signal: controller.signal
      });
      if (!response.ok) throw new Error('Feed unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.posts)) throw new Error('Invalid feed');
      const source = sourceDetails(data);
      const seen = new Set();
      const posts = data.posts.filter((post) => {
        if (!post || !source.valid(post) || seen.has(post.id)
          || typeof post.published_at !== 'string' || !Number.isFinite(Date.parse(post.published_at))) return false;
        seen.add(post.id);
        return true;
      }).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)
        || (BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : 0)).slice(0, 3);
      const content = JSON.stringify([source.key, data.guild_id, data.channel_ids, posts]);
      if (content === lastContent || feed.contains(document.activeElement)) return;
      feed.replaceChildren(...posts.map((post) => createCard(post, source)));
      feed.setAttribute('aria-label', `Latest ${source.label} updates`);
      section.querySelector('[data-news-origin]').textContent = `From the ${source.label} ${source.key === 'discord' ? 'community' : 'channel'}`;
      section.querySelector('[data-news-footer]').textContent = `More from BonaLabs, directly on ${source.label}.`;
      const join = section.querySelector('[data-news-join]');
      join.href = source.join;
      join.classList.toggle('social-discord', source.key === 'discord');
      join.classList.toggle('social-telegram', source.key === 'telegram');
      join.dataset.communityPlatform = source.key;
      join.querySelector('[data-news-join-label]').textContent = `Join ${source.label}`;
      feed.hidden = posts.length === 0;
      empty.hidden = posts.length > 0;
      lastContent = content;
    } catch {
      // Keep the last successful feed, or the ordinary channel link on first load.
    } finally {
      window.clearTimeout(timeout);
      loading = false;
    }
  };

  refresh();
  window.setInterval(refresh, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', refresh);
})();
