(() => {
  const legacyTrackerUrl = document.body.dataset.legacyTrackerUrl;
  const redirectLegacyTrackerLink = () => {
    if (!legacyTrackerUrl || !window.location.hash) return false;
    let id;
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return false; }
    if (document.getElementById(id)) return false;
    if (!/^(?:update-\d{4}-\d{2}-\d{2}(?:-.*)?|period-\d.*|(?:june|july|august|september|october)-(?:2026|title)|about(?:-title)?)$/.test(id)) return false;
    const archiveUrl = new URL(legacyTrackerUrl, window.location.href);
    archiveUrl.hash = window.location.hash;
    window.location.replace(archiveUrl.href);
    return true;
  };
  if (redirectLegacyTrackerLink()) return;
  if (legacyTrackerUrl) window.addEventListener('hashchange', redirectLegacyTrackerLink);

  document.querySelectorAll('[data-community-platform]').forEach((link) => {
    link.addEventListener('click', () => {
      if (typeof window.gtag !== 'function') return;
      window.gtag('event', 'community_click', {
        community_platform: link.dataset.communityPlatform,
        community_placement: link.closest('[data-community-placement]')?.dataset.communityPlacement,
        transport_type: 'beacon'
      });
    });
  });

  const backToTop = document.querySelector('[data-back-to-top]');

  if (backToTop) {
    const updateBackToTop = () => {
      backToTop.hidden = window.scrollY <= 300;
    };

    updateBackToTop();
    window.addEventListener('scroll', updateBackToTop, { passive: true });
  }

  document.querySelectorAll('.tableWrapper').forEach((wrapper, index) => {
    const pageTitle = document.querySelector('h1')?.textContent.trim() || 'BonaLabs';
    if (!wrapper.hasAttribute('tabindex')) wrapper.tabIndex = 0;
    if (!wrapper.hasAttribute('role')) wrapper.setAttribute('role', 'region');
    if (!wrapper.hasAttribute('aria-label')) {
      wrapper.setAttribute('aria-label', `Data table ${index + 1}: ${pageTitle}`);
    }
  });

  const imagePreviewLinks = document.querySelectorAll('.post-body [data-image-preview]');

  if (imagePreviewLinks.length && typeof HTMLDialogElement !== 'undefined'
    && typeof HTMLDialogElement.prototype.showModal === 'function') {
    const viewer = document.createElement('dialog');
    viewer.className = 'article-image-viewer';
    viewer.setAttribute('aria-label', 'Image viewer');
    viewer.innerHTML = `
      <button type="button" class="article-image-stage" aria-label="Close image" autofocus>
        <img alt="" draggable="false">
      </button>
    `;
    document.body.append(viewer);

    const previewImage = viewer.querySelector('img');
    const previewButton = viewer.querySelector('.article-image-stage');
    let activeLink;
    let readingPosition;

    imagePreviewLinks.forEach((link) => {
      const thumbnail = link.querySelector('img');
      if (!thumbnail) return;
      link.setAttribute('aria-haspopup', 'dialog');
      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        activeLink = link;
        readingPosition = { left: window.scrollX, top: window.scrollY };
        previewImage.alt = thumbnail.alt;
        previewImage.src = link.href;
        previewButton.setAttribute('aria-label', thumbnail.alt ? `${thumbnail.alt} Close image.` : 'Close image');
        document.documentElement.style.setProperty('--image-viewer-scrollbar-width', `${window.innerWidth - document.documentElement.clientWidth}px`);
        document.documentElement.classList.add('article-image-open');
        viewer.showModal();
      });
    });

    previewButton.addEventListener('click', () => viewer.close());
    viewer.addEventListener('close', () => {
      document.documentElement.classList.remove('article-image-open');
      document.documentElement.style.removeProperty('--image-viewer-scrollbar-width');
      activeLink?.focus({ preventScroll: true });
      if (readingPosition) window.scrollTo({ ...readingPosition, behavior: 'instant' });
    });
  }

  const articleIndex = document.querySelector('[data-article-index]');

  if (articleIndex) {
    const indexLinks = [...articleIndex.querySelectorAll('a[href^="#"]')];
    const sections = indexLinks
      .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
      .filter(({ section }) => section);
    let updatePending = false;

    const updateArticleIndex = () => {
      const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
      const marker = headerHeight + 64;
      let active = sections[0];
      sections.forEach((entry) => {
        if (entry.section.getBoundingClientRect().top <= marker) active = entry;
      });
      if (Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2) {
        active = sections.at(-1);
      }
      sections.forEach(({ link }) => {
        if (link === active?.link) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      updatePending = false;
    };

    const queueIndexUpdate = () => {
      if (updatePending) return;
      updatePending = true;
      window.requestAnimationFrame(updateArticleIndex);
    };

    updateArticleIndex();
    window.addEventListener('scroll', queueIndexUpdate, { passive: true });
    window.addEventListener('resize', queueIndexUpdate);
    window.addEventListener('load', queueIndexUpdate);
  }

  const openAncestorDetails = (element) => {
    let details = element?.matches('details') ? element : element?.closest('details');

    while (details) {
      details.open = true;
      details = details.parentElement?.closest('details');
    }
  };

  const revealTrackerUpdate = () => {
    if (!window.location.hash) return;

    let targetId;
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }

    const target = document.getElementById(targetId);
    const update = target?.matches('details')
      ? target
      : target?.closest('details');

    if (!update) return;
    openAncestorDetails(update);
    window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };

  revealTrackerUpdate();
  window.addEventListener('hashchange', revealTrackerUpdate);

  const patchNotesLibrary = document.querySelector('[data-patch-notes-library]');
  if (patchNotesLibrary) {
    const controls = patchNotesLibrary.querySelector('[data-patch-notes-filters]');
    const buttons = [...controls.querySelectorAll('[data-patch-filter]')];
    const cards = [...patchNotesLibrary.querySelectorAll('[data-patch-editions], [data-patch-edition]')];
    const empty = patchNotesLibrary.querySelector('[data-patch-notes-empty]');
    const applyEdition = (edition, updateUrl = false) => {
      const selected = ['basic', 'essence'].includes(edition) ? edition : 'all';
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.patchFilter === selected)));
      cards.forEach((card) => {
        const editions = (card.dataset.patchEditions || card.dataset.patchEdition || '').split(/\s+/);
        card.hidden = selected !== 'all' && !editions.includes(selected);
      });
      empty.hidden = cards.some((card) => !card.hidden);
      empty.textContent = selected === 'essence'
        ? 'No Essence patch notes have been published here yet.'
        : selected === 'basic' ? 'No BASIC patch notes have been published here yet.' : 'No weekly patch notes have been published here yet.';
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (selected === 'all') url.searchParams.delete('edition');
        else url.searchParams.set('edition', selected);
        window.history.replaceState(null, '', url);
      }
    };
    buttons.forEach((button) => button.addEventListener('click', () => applyEdition(button.dataset.patchFilter, true)));
    applyEdition(new URLSearchParams(window.location.search).get('edition'));
    controls.hidden = false;
  }

  const searchForm = document.querySelector('[data-tracker-search]');

  if (searchForm) {
    const searchInput = searchForm.querySelector('input[type="search"]');
    const clearButton = searchForm.querySelector('[data-tracker-search-clear]');
    const resultsList = searchForm.querySelector('[data-tracker-search-results]');
    const status = document.getElementById('tracker-search-status');
    const weeklyIndexUrl = searchForm.dataset.patchNotesIndex;
    let indexState = weeklyIndexUrl ? 'loading' : 'ready';
    const stopWords = new Set(['a', 'an', 'and', 'are', 'did', 'do', 'does', 'for', 'from', 'has', 'have', 'how', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'update', 'updates', 'was', 'were', 'what', 'when', 'where', 'which', 'with']);
    const aliases = {
      atk: ['attack'],
      attack: ['atk'],
      cooldown: ['reuse'],
      crit: ['critical'],
      critical: ['crit'],
      damage: ['dmg'],
      defence: ['defense', 'def'],
      defense: ['defence', 'def'],
      dmg: ['damage'],
      experience: ['xp', 'exp'],
      exp: ['xp', 'experience'],
      mob: ['monster'],
      mobs: ['monster', 'monsters'],
      monster: ['mob'],
      monsters: ['mobs'],
      reuse: ['cooldown'],
      xp: ['experience', 'exp']
    };

    const normalize = (value) => value
      .toLocaleLowerCase('en')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const editDistance = (left, right) => {
      if (Math.abs(left.length - right.length) > 2) return 3;
      const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

      for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        let rowMinimum = current[0];

        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
          const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
          current[rightIndex] = Math.min(
            current[rightIndex - 1] + 1,
            previous[rightIndex] + 1,
            previous[rightIndex - 1] + cost
          );
          rowMinimum = Math.min(rowMinimum, current[rightIndex]);
        }

        if (rowMinimum > 2) return 3;
        previous.splice(0, previous.length, ...current);
      }

      return previous[right.length];
    };

    const entries = Array.from(document.querySelectorAll('.weekly-update .change-entry')).map((entry) => {
      const update = entry.closest('.weekly-update');
      const time = update.querySelector('time');
      const heading = entry.querySelector('.change-entry-header h4');
      const searchableParts = Array.from(entry.querySelectorAll('h4, p, li, th, td'))
        .map((element) => element.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const excerptParts = Array.from(entry.querySelectorAll('p, li, td'))
        .map((element) => element.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const rawText = searchableParts.join(' ');
      const normalizedText = normalize(`${time.dateTime} ${time.textContent} ${rawText}`);

      return {
        date: time.textContent.trim(),
        isoDate: time.dateTime,
        heading,
        id: heading.id,
        normalizedText,
        title: heading.textContent.trim(),
        titleText: normalize(heading.textContent),
        words: Array.from(new Set(normalizedText.split(' '))),
        excerpt: excerptParts.join(' ')
      };
    });

    const tokenScore = (entry, token) => {
      if (entry.applicableEditions && ['basic', 'essence', 'main'].includes(token)) {
        const edition = token === 'main' ? 'essence' : token;
        if (!entry.applicableEditions.includes(edition)) return 0;
        return entry.titleText.split(' ').includes(edition) ? 24 : 14;
      }
      const variants = [token, ...(aliases[token] || [])];
      let best = 0;

      variants.forEach((variant) => {
        if (entry.titleText.split(' ').includes(variant)) best = Math.max(best, 24);
        if (entry.words.includes(variant)) best = Math.max(best, 14);
        if (variant.length >= 3 && entry.words.some((word) => word.startsWith(variant))) best = Math.max(best, 9);

        const tolerance = variant.length >= 7 ? 2 : variant.length >= 4 ? 1 : 0;
        if (tolerance && entry.words.some((word) => Math.abs(word.length - variant.length) <= tolerance && editDistance(word, variant) <= tolerance)) {
          best = Math.max(best, 5);
        }
      });

      return best;
    };

    const getExcerpt = (entry, tokens) => {
      const lowerText = entry.excerpt.toLocaleLowerCase('en');
      const candidates = tokens.flatMap((token) => [token, ...(aliases[token] || [])]);
      const positions = candidates.map((candidate) => lowerText.indexOf(candidate)).filter((index) => index >= 0);
      const matchPosition = positions.length ? Math.min(...positions) : 0;
      const start = Math.max(0, matchPosition - 72);
      const end = Math.min(entry.excerpt.length, start + 210);
      const prefix = start > 0 ? '\u2026' : '';
      const suffix = end < entry.excerpt.length ? '\u2026' : '';
      return `${prefix}${entry.excerpt.slice(start, end).trim()}${suffix}`;
    };

    const createResult = (entry, tokens) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      const date = document.createElement('span');
      const title = document.createElement('strong');
      const excerpt = document.createElement('span');

      link.href = entry.href || `#${entry.id}`;
      date.className = 'tracker-search-result-date';
      date.textContent = entry.date;
      title.className = 'tracker-search-result-title';
      title.textContent = entry.title;
      excerpt.className = 'tracker-search-result-excerpt';
      excerpt.textContent = getExcerpt(entry, tokens);
      link.append(date, title, excerpt);
      if (entry.heading) {
        link.addEventListener('click', () => {
          openAncestorDetails(entry.heading);
          window.requestAnimationFrame(() => entry.heading.scrollIntoView({ block: 'start' }));
        });
      }
      item.append(link);
      return item;
    };

    const runSearch = () => {
      const rawQuery = searchInput.value.trim();
      const normalizedQuery = normalize(rawQuery);
      const rawTokens = normalizedQuery.split(' ').filter(Boolean);
      const meaningfulTokens = rawTokens.filter((token) => !stopWords.has(token));
      const tokens = meaningfulTokens.length ? meaningfulTokens : rawTokens;

      clearButton.hidden = !rawQuery;
      resultsList.replaceChildren();

      if (!rawQuery) {
        resultsList.hidden = true;
        status.textContent = '';
        return;
      }

      if (normalizedQuery.length < 2 || !tokens.length) {
        resultsList.hidden = true;
        status.textContent = 'Enter at least 2 characters.';
        return;
      }

      if (!entries.length && indexState !== 'ready') {
        resultsList.hidden = true;
        status.textContent = indexState === 'loading'
          ? 'Loading patch notes…'
          : 'Search is unavailable. Browse the weekly patch notes below.';
        return;
      }

      const matches = entries
        .map((entry) => {
          const scores = tokens.map((token) => tokenScore(entry, token));
          if (scores.some((score) => score === 0)) return null;
          let score = scores.reduce((total, value) => total + value, 0);
          if (entry.normalizedText.includes(normalizedQuery)) score += 40;
          if (entry.titleText.includes(normalizedQuery)) score += 80;
          return { entry, score };
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || right.entry.isoDate.localeCompare(left.entry.isoDate));

      if (!matches.length) {
        resultsList.hidden = true;
        status.textContent = `No results for "${rawQuery}".`;
        return;
      }

      const visibleMatches = matches.slice(0, 10);
      visibleMatches.forEach(({ entry }) => resultsList.append(createResult(entry, tokens)));
      resultsList.hidden = false;
      status.textContent = matches.length > visibleMatches.length
        ? `Showing ${visibleMatches.length} of ${matches.length} results.`
        : `${matches.length} result${matches.length === 1 ? '' : 's'}.`;
    };

    const clearSearch = () => {
      searchInput.value = '';
      runSearch();
      searchInput.focus();
    };

    searchForm.hidden = false;
    searchInput.addEventListener('input', runSearch);
    clearButton.addEventListener('click', clearSearch);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && searchInput.value) clearSearch();
    });
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      resultsList.querySelector('a')?.click();
    });

    if (weeklyIndexUrl) {
      fetch(weeklyIndexUrl, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) throw new Error('Patch notes index could not be loaded.');
          return response.json();
        })
        .then((index) => {
          if (![1, 2].includes(index.version) || !Array.isArray(index.notes)) throw new Error('Invalid patch notes index.');
          index.notes.forEach((note) => {
            const editions = Array.isArray(note.editions) ? note.editions : [note.edition];
            if (!editions.length || !editions.every((edition) => ['basic', 'essence'].includes(edition))
              || !/^\d{4}-\d{2}-\d{2}$/.test(note.date) || typeof note.url !== 'string'
              || !note.url.startsWith('/articles/patch-notes/') || !Array.isArray(note.topics)) return;
            const date = note.date.split('-').reverse().join('.');
            note.topics.forEach((topic) => {
              if (typeof topic.id !== 'string' || !/^[a-z0-9-]+$/.test(topic.id)
                || typeof topic.title !== 'string' || typeof topic.text !== 'string') return;
              const scope = topic.scope || (editions.length === 1 ? editions[0] : 'common');
              if (!['common', ...editions].includes(scope)) return;
              const label = { common: 'Common', basic: 'BASIC', essence: 'Essence' }[scope];
              const appliesTo = scope === 'common' ? editions : [scope];
              const title = `${label} · ${topic.title}`;
              const normalizedText = normalize(`${note.date} ${date} ${note.title} ${title} ${appliesTo.join(' ')} ${topic.text}`);
              entries.push({
                date, isoDate: note.date, id: topic.id, title,
                applicableEditions: appliesTo,
                href: `${note.url}#${topic.id}`,
                titleText: normalize(title), normalizedText,
                words: Array.from(new Set(normalizedText.split(' '))),
                excerpt: topic.text
              });
            });
          });
          indexState = 'ready';
          runSearch();
        })
        .catch(() => {
          indexState = 'error';
          runSearch();
        });
    }
  }
})();
