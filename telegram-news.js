(() => {
  const section = document.querySelector('[data-telegram-news]');
  if (!section) return;

  const feed = section.querySelector('[data-telegram-feed]');
  const empty = section.querySelector('[data-telegram-empty]');
  const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
  let lastContent = '';
  let loading = false;

  const createCard = (post) => {
    const item = document.createElement('li');
    const article = document.createElement('article');
    article.className = 'telegram-news-card';

    if (typeof post.image === 'string' && /^assets\/telegram\/[\w-]+\.(jpg|png|webp)$/.test(post.image)) {
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
    link.href = `https://t.me/BonaLabs/${post.id}`;
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
    read.textContent = 'Read on Telegram →';
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
      const response = await fetch('data/telegram-feed.json', {
        cache: 'no-cache', signal: controller.signal
      });
      if (!response.ok) throw new Error('Feed unavailable');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.posts)) throw new Error('Invalid feed');
      const seen = new Set();
      const posts = data.posts.filter((post) => {
        if (!post || !Number.isSafeInteger(post.id) || post.id <= 0 || seen.has(post.id)
          || typeof post.published_at !== 'string' || !Number.isFinite(Date.parse(post.published_at))) return false;
        seen.add(post.id);
        return true;
      }).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || b.id - a.id).slice(0, 3);
      const content = JSON.stringify(posts);
      if (content === lastContent || feed.contains(document.activeElement)) return;
      feed.replaceChildren(...posts.map(createCard));
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
