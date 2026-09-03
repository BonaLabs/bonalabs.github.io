(() => {
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

  const revealTrackerUpdate = () => {
    if (!window.location.hash) return;

    let targetId;
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }

    const target = document.getElementById(targetId);
    const update = target?.matches('details.weekly-update')
      ? target
      : target?.closest('details.weekly-update');

    if (!update) return;
    update.open = true;
    window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };

  revealTrackerUpdate();
  window.addEventListener('hashchange', revealTrackerUpdate);

  const searchForm = document.querySelector('[data-tracker-search]');

  if (searchForm) {
    const searchInput = searchForm.querySelector('input[type="search"]');
    const clearButton = searchForm.querySelector('[data-tracker-search-clear]');
    const resultsList = searchForm.querySelector('[data-tracker-search-results]');
    const status = document.getElementById('tracker-search-status');
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

      link.href = `#${entry.id}`;
      date.className = 'tracker-search-result-date';
      date.textContent = entry.date;
      title.className = 'tracker-search-result-title';
      title.textContent = entry.title;
      excerpt.className = 'tracker-search-result-excerpt';
      excerpt.textContent = getExcerpt(entry, tokens);
      link.append(date, title, excerpt);
      link.addEventListener('click', () => {
        entry.heading.closest('.weekly-update').open = true;
        window.requestAnimationFrame(() => entry.heading.scrollIntoView({ block: 'start' }));
      });
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
  }
})();
