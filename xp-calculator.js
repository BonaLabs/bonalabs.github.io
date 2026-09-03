(() => {
  'use strict';

  const TOTAL_EXP = [
    0n,
    0n, 1n, 4n, 12n, 29n, 61n, 113n, 195n, 314n, 483n,
    713n, 1017n, 1412n, 1915n, 2544n, 3319n, 4263n, 5401n, 6756n, 8359n,
    10202n, 12322n, 14759n, 17562n, 20786n, 24525n, 28863n, 33894n, 39731n, 46502n,
    54423n, 63691n, 74535n, 87222n, 102066n, 119582n, 140251n, 164640n, 193420n, 227379n,
    267791n, 315881n, 373109n, 441209n, 522249n, 619497n, 736194n, 876230n, 1044274n, 1245926n,
    1487909n, 1778289n, 2126744n, 2544891n, 3046667n, 3648798n, 4371356n, 5238425n, 6278907n, 7527486n,
    9025782n, 10823736n, 12981280n, 15570334n, 18677199n, 22405436n, 26879321n, 32292722n, 38842937n, 46834200n,
    56663453n, 68851726n, 84087068n, 103283599n, 127663192n, 158869073n, 199436717n, 254203037n, 330875885n, 445885156n,
    618399064n, 877169925n, 1265326216n, 1847560654n, 2720912310n, 4030939794n, 5995981021n, 9533055228n, 16607203644n, 37758907406n,
    143517426215n, 608854908977n, 2656339833127n, 7775052143502n, 33368613695379n, 186929983006641n, 801175460251689n, 3258157369231880n, 13086085005152600n, 52397795548835696n
  ];

  const POSITION_SCALE = 1000000n;
  const numberFormatter = new Intl.NumberFormat('en-US');
  const form = document.getElementById('xpForm');
  const currentLevel = document.getElementById('currentLevel');
  const targetLevel = document.getElementById('targetLevel');
  const currentProgress = document.getElementById('currentProgress');
  const targetProgress = document.getElementById('targetProgress');
  const xpPerHour = document.getElementById('xpPerHour');
  const xpPerKill = document.getElementById('xpPerKill');
  const error = document.getElementById('xpError');
  let referenceBuilt = false;

  function populateLevels() {
    for (let level = 1; level <= 100; level += 1) {
      currentLevel.add(new Option(`Level ${level}`, level));
      targetLevel.add(new Option(`Level ${level}`, level));
    }
    currentLevel.value = '80';
    targetLevel.value = '85';
  }

  function parsePercent(value) {
    const normalized = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
    const [whole, decimals = ''] = normalized.split('.');
    const fraction = (decimals + '000000').slice(0, 6);
    const units = BigInt(whole) * 10000n + BigInt(fraction.slice(0, 4) || '0');
    return units >= 0n && units < POSITION_SCALE ? units : null;
  }

  function parseAmount(value) {
    const normalized = String(value).trim().toLowerCase().replace(/[,_\s]/g, '');
    if (!normalized) return null;
    const match = normalized.match(/^(\d+)(?:\.(\d+))?([kmbtq])?$/);
    if (!match) return null;
    const powers = { k: 3, m: 6, b: 9, t: 12, q: 15 };
    const power = match[3] ? powers[match[3]] : 0;
    const decimals = (match[2] || '').slice(0, power);
    const padded = decimals.padEnd(power, '0');
    return BigInt(match[1]) * (10n ** BigInt(power)) + BigInt(padded || '0');
  }

  function position(level, progressUnits) {
    if (level >= 100) return TOTAL_EXP[100] * POSITION_SCALE;
    return TOTAL_EXP[level] * POSITION_SCALE + (TOTAL_EXP[level + 1] - TOTAL_EXP[level]) * progressUnits;
  }

  function ceilDiv(value, divisor) {
    return (value + divisor - 1n) / divisor;
  }

  function formatInteger(value) {
    return numberFormatter.format(value);
  }

  function formatPercent(part, whole) {
    if (whole <= 0n || part <= 0n) return '0%';
    const hundredths = (part * 10000n) / whole;
    if (hundredths === 0n) return '<0.01%';
    const wholePart = hundredths / 100n;
    const decimalPart = hundredths % 100n;
    return decimalPart === 0n ? `${wholePart}%` : `${wholePart}.${decimalPart.toString().padStart(2, '0').replace(/0$/, '')}%`;
  }

  function widthPercent(part, whole) {
    if (whole <= 0n || part <= 0n) return '0%';
    const thousandths = part * 100000n / whole;
    return `${thousandths / 1000n}.${(thousandths % 1000n).toString().padStart(3, '0')}%`;
  }

  function formatDuration(exp, rate) {
    if (!rate || rate <= 0n) return 'Add EXP / hour';
    const minutes = ceilDiv(exp * 60n, rate);
    const days = minutes / 1440n;
    const hours = (minutes % 1440n) / 60n;
    const mins = minutes % 60n;
    const parts = [];
    if (days) parts.push(`${formatInteger(days)}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins || !parts.length) parts.push(`${mins}m`);
    return parts.slice(0, 2).join(' ');
  }

  function describePosition(exp) {
    if (exp >= TOTAL_EXP[100]) return 'Level 100';
    let level = 1;
    while (level < 100 && TOTAL_EXP[level + 1] <= exp) level += 1;
    const span = TOTAL_EXP[level + 1] - TOTAL_EXP[level];
    const percent = span ? ((exp - TOTAL_EXP[level]) * 1000n / span) : 0n;
    const display = `${percent / 10n}.${percent % 10n}`;
    return `Level ${level} at ${display}%`;
  }

  function stageRows(startLevel, endLevel, startPosition, endPosition) {
    const rows = [];
    for (let level = startLevel; level < 100 && level <= endLevel; level += 1) {
      const lower = TOTAL_EXP[level] * POSITION_SCALE;
      const upper = TOTAL_EXP[level + 1] * POSITION_SCALE;
      const from = startPosition > lower ? startPosition : lower;
      const to = endPosition < upper ? endPosition : upper;
      if (to > from) rows.push({ level, scaled: to - from });
    }
    return rows;
  }

  function renderBreakdown(rows, required) {
    const body = document.getElementById('breakdownBody');
    let running = 0n;
    body.innerHTML = rows.map(row => {
      const stageExp = ceilDiv(row.scaled, POSITION_SCALE);
      running += stageExp;
      return `<tr><td>Lv. ${row.level} → ${row.level + 1}</td><td>${formatInteger(stageExp)}</td><td>${formatInteger(running)}</td><td>${formatPercent(stageExp, required)}</td></tr>`;
    }).join('');
    document.getElementById('breakdownSummary').textContent = rows.length === 1 ? 'One level segment' : `${rows.length} level segments`;
  }

  function renderInsights(rows, required, startPosition) {
    const fullStages = rows.map(row => ({ level: row.level, exp: ceilDiv(row.scaled, POSITION_SCALE) }));
    const biggest = fullStages.reduce((best, row) => row.exp > best.exp ? row : best, fullStages[0]);
    document.getElementById('biggestFact').textContent = biggest ? `Lv. ${biggest.level} → ${biggest.level + 1} · ${formatInteger(biggest.exp)} EXP` : 'No level crossed';
    document.getElementById('alternateFact').textContent = `${describePosition(required)} from scratch`;

    const startLevel = Number(currentLevel.value);
    const firstFullCost = startLevel < 100 ? TOTAL_EXP[startLevel + 1] - TOTAL_EXP[startLevel] : 0n;
    const last = fullStages[fullStages.length - 1];
    if (last && firstFullCost > 0n) {
      const tenths = last.exp * 10n / firstFullCost;
      document.getElementById('spikeFact').textContent = `${tenths / 10n}.${tenths % 10n}× the first level step`;
    } else {
      document.getElementById('spikeFact').textContent = 'Already at the target';
    }

    const targetPosition = startPosition + required * POSITION_SCALE;
    document.getElementById('journeyProgressBar').style.width = widthPercent(startPosition, targetPosition);
    document.getElementById('journeyProgressText').textContent = `${formatPercent(startPosition, targetPosition)} of the target's total EXP already earned`;
  }

  function calculate(event) {
    if (event) event.preventDefault();
    error.hidden = true;
    const fromLevel = Number(currentLevel.value);
    const toLevel = Number(targetLevel.value);
    const fromPercent = fromLevel === 100 ? 0n : parsePercent(currentProgress.value);
    const toPercent = toLevel === 100 ? 0n : parsePercent(targetProgress.value);

    if (fromPercent === null || toPercent === null) {
      error.textContent = 'Progress must be between 0 and 99.9999%.';
      error.hidden = false;
      return;
    }

    const start = position(fromLevel, fromPercent);
    const target = position(toLevel, toPercent);
    if (target <= start) {
      error.textContent = 'Choose a target that comes after your starting point.';
      error.hidden = false;
      return;
    }

    const perHour = parseAmount(xpPerHour.value);
    const perKill = parseAmount(xpPerKill.value);
    if ((xpPerHour.value.trim() && (!perHour || perHour <= 0n)) || (xpPerKill.value.trim() && (!perKill || perKill <= 0n))) {
      error.textContent = 'Use a positive EXP amount. Commas and shortcuts like 500m or 1.5b are supported.';
      error.hidden = false;
      return;
    }

    const deltaScaled = target - start;
    const required = ceilDiv(deltaScaled, POSITION_SCALE);
    const rows = stageRows(fromLevel, toLevel, start, target);
    const routeEnd = toLevel === 100 ? 'Lv. 100' : `Lv. ${toLevel} · ${targetProgress.value || 0}%`;
    document.getElementById('resultRoute').textContent = `Lv. ${fromLevel} · ${currentProgress.value || 0}% → ${routeEnd}`;
    document.getElementById('xpRequired').textContent = formatInteger(required);
    document.getElementById('timeRequired').textContent = formatDuration(required, perHour);
    document.getElementById('killsRequired').textContent = perKill ? formatInteger(ceilDiv(required, perKill)) : 'Add EXP / kill';
    document.getElementById('levelsCrossed').textContent = String(rows.length);
    document.getElementById('worldShare').textContent = formatPercent(required, TOTAL_EXP[100]);
    renderBreakdown(rows, required);
    renderInsights(rows, required, start);
  }

  function buildReferenceTable() {
    if (referenceBuilt) return;
    document.getElementById('referenceBody').innerHTML = TOTAL_EXP.slice(1).map((total, index) => {
      const level = index + 1;
      const gained = level === 1 ? 0n : total - TOTAL_EXP[level - 1];
      return `<tr><td>${level}</td><td>${formatInteger(total)}</td><td>${formatInteger(gained)}</td></tr>`;
    }).join('');
    referenceBuilt = true;
  }

  function normalizeLevelInputs() {
    currentProgress.disabled = currentLevel.value === '100';
    targetProgress.disabled = targetLevel.value === '100';
    if (currentProgress.disabled) currentProgress.value = '0';
    if (targetProgress.disabled) targetProgress.value = '0';
  }

  populateLevels();
  normalizeLevelInputs();
  form.addEventListener('submit', calculate);
  currentLevel.addEventListener('change', normalizeLevelInputs);
  targetLevel.addEventListener('change', normalizeLevelInputs);
  document.querySelector('.xp-reference').addEventListener('toggle', event => {
    if (event.currentTarget.open) buildReferenceTable();
  });
  document.getElementById('maxJourney').addEventListener('click', () => {
    targetLevel.value = '100';
    targetProgress.value = '0';
    normalizeLevelInputs();
    calculate();
  });
  [xpPerHour, xpPerKill].forEach(input => input.addEventListener('blur', () => {
    const amount = parseAmount(input.value);
    if (amount !== null) input.value = formatInteger(amount);
  }));
  calculate();
})();
