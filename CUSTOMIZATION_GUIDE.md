# Code Snippets & Customization Guide

## Quick Reference: Common Modifications

### Adjusting the Primary Accent Color

If you want to shift the primary blue-teal accent warmer or cooler:

```css
:root {
  /* Current (warm, muted blue) */
  --accent:       #5BA3C0;
  --accent-dim:   #4A8BA6;
  --accent-hover: #6BB3D0;

  /* Cooler variant (if too warm): */
  /* --accent:       #4A9BC3; */
  /* --accent-dim:   #3B80A8; */
  /* --accent-hover: #5BACE0; */

  /* Warmer variant (if too cool): */
  /* --accent:       #7BA3B0; */
  /* --accent-dim:   #6A8A95; */
  /* --accent-hover: #8BB3C0; */
}
```

---

### Adjusting Status Colors

**Make Buff/Nerf/Fix more prominent:**

```css
:root {
  /* Current (dusty, subtle) */
  --buff:        #7FB380;
  --buff-muted:  rgba(127, 179, 128, 0.2);
  
  /* More vibrant variant: */
  /* --buff:        #8BC788; */
  /* --buff-muted:  rgba(139, 199, 136, 0.25); */
}
```

**Make Nerf less alarming (more muted):**

```css
:root {
  /* Current */
  --nerf:        #C46E7F;
  
  /* Even dustier variant: */
  /* --nerf:        #B05A6B; */
}
```

---

### Changing Font Pairings

**Current (Recommended):**
```css
--font-serif:   'Merriweather', serif;
--font-body:    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono:    'Menlo', 'Consolas', monospace;
```

**Alternative: Georgia + System Fonts (Even More Classic)**
```css
@import url('https://fonts.googleapis.com/css2?family=Georgia&display=swap');

--font-serif:   'Georgia', serif;
--font-body:    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono:    'Menlo', 'Consolas', monospace;
```

**Alternative: Lora + Lato (Warm & Modern)**
```css
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;700&family=Lato:wght@300;400;700&display=swap');

--font-serif:   'Lora', serif;
--font-body:    'Lato', sans-serif;
--font-mono:    'Menlo', 'Consolas', monospace;
```

---

### Adjusting Overall Spacing

**If content feels too spread out, reduce gaps:**

```css
.posts-grid {
  gap: 24px;          /* Current */
  /* gap: 20px; */    /* Tighter */
  /* gap: 28px; */    /* More spacious */
}

body {
  line-height: 1.7;   /* Current */
  /* line-height: 1.6; */ /* Compact */
  /* line-height: 1.8; */ /* Roomy */
}
```

---

### Softening or Sharpening Borders

**More pronounced (sharper):**

```css
.post-card {
  border: 1px solid rgba(30, 39, 48, 0.7);  /* Increased opacity */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
```

**More subtle (softer):**

```css
.post-card {
  border: 1px solid rgba(30, 39, 48, 0.3);  /* Decreased opacity */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.01);
}
```

---

### Increasing Border Radius (More Rounded)

To make corners softer throughout:

```css
/* Current (very subtle): 2px */
.post-card, .nav-link, code, .change-type {
  border-radius: 2px;
}

/* Medium roundness: */
/* border-radius: 4px; */

/* Significant roundness: */
/* border-radius: 6px; */

/* Very rounded (pill-like): */
/* border-radius: 20px; */
```

**Global change (applies everywhere):**
```css
:root {
  --border-radius: 2px;  /* Add this variable */
}

* {
  border-radius: var(--border-radius);
}

/* Then adjust one variable */
```

---

### Hover Effect Intensity

**Current (subtle):**

```css
.post-card:hover {
  transform: translateY(-1px);
  transition: 0.3s ease;
}
```

**More dramatic (nostalgia/playful):**

```css
.post-card:hover {
  transform: translateY(-4px);
  transition: 0.3s ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1),
              inset -1px 0 0 rgba(91, 163, 192, 0.2),
              0 4px 12px rgba(0, 0, 0, 0.3);  /* Add outer shadow */
}
```

**Even more subtle (minimalist):**

```css
.post-card:hover {
  transform: translateY(0px);  /* No movement */
  transition: 0.3s ease;
  border-color: var(--accent-dim);  /* Just color change */
}
```

---

### Adding Glow Effects Back (If Desired)

To reintroduce a subtle neon feel while keeping soft palette:

```css
.nav-link:hover {
  box-shadow: 0 0 8px rgba(91, 163, 192, 0.2);  /* Soft outer glow */
  color: var(--accent);
}

.post-card:hover::before {
  box-shadow: inset 0 0 4px rgba(91, 163, 192, 0.3);  /* Subtle glow */
}
```

---

### Making Typography More Classic (Gaming Wiki Style)

Increase serif usage:

```css
/* Use serif for post meta (currently sans-serif) */
.post-meta {
  font-family: var(--font-serif);  /* Change from --font-body */
  font-size: 13px;
  font-weight: 400;
}

/* Use serif for section titles */
.section-title {
  font-family: var(--font-serif);
  font-size: 14px;
}

/* Use serif for nav items (tech-forward → editorial) */
.nav-link {
  font-family: var(--font-serif);
  font-size: 13px;
}
```

---

### Adding Texture/Noise (Vintage Feel)

To add subtle background texture:

```css
body {
  background: var(--bg);
  background-image: 
    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.03) 2px, rgba(0,0,0,.03) 4px),
    url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23000" width="100" height="100"/><path d="M0 0L100 100M100 0L0 100" stroke="%23111" stroke-width=".5"/></svg>');
  background-size: 100% 100%, 100px 100px;
}
```

---

### Dark Mode Variant (Already Implemented)

Your current palette is already dark mode optimized. No changes needed.

To test light mode (not recommended for this style):

```css
/* DON'T DO THIS - just for reference */
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f5f5f0;
    --text-primary: #1a1a1a;
    --text-secondary: #666;
    --accent: #5BA3C0;  /* Blue works in light mode too */
  }
}
```

---

### Typography Adjustments by Element

#### Make Headings Bolder
```css
.post-heading {
  font-weight: 700;           /* Current */
  /* font-weight: 800; */     /* Bolder */
  /* font-weight: 900; */     /* Maximum boldness */
}
```

#### Make Body Text Lighter (More Elegant)
```css
body {
  font-weight: 400;           /* Current (normal) */
  /* font-weight: 300; */     /* Lighter, more elegant */
}
```

#### Adjust Letter Spacing (Add Back Some!)
```css
.nav-link {
  letter-spacing: 0;          /* Current (normal) */
  /* letter-spacing: 0.05em; */ /* Subtle spread */
  /* letter-spacing: 0.1em; */  /* More tech-like */
}
```

---

### Advanced: CSS Variables Customization Template

Save this as a reference for your own custom theme:

```css
:root {
  /* CUSTOMIZE THESE FOR YOUR OWN THEME */
  
  /* Primary accent color (change this one value, others cascade) */
  --accent:           #5BA3C0;  /* Muted blue */
  --accent-dim:       #4A8BA6;  /* Darker variant */
  --accent-hover:     #6BB3D0;  /* Lighter on hover */
  --accent-glow:      rgba(91, 163, 192, 0.15);
  
  /* Status colors */
  --buff:             #7FB380;  /* Positive/increase */
  --buff-muted:       rgba(127, 179, 128, 0.2);
  --nerf:             #C46E7F;  /* Negative/decrease */
  --nerf-muted:       rgba(196, 110, 127, 0.2);
  --fix:              #C4A85D;  /* Fix/change */
  --fix-muted:        rgba(196, 168, 93, 0.2);
  
  /* Text hierarchy */
  --text-primary:     #d8dce5;  /* Main text */
  --text-secondary:   #8a96a8;  /* Secondary text */
  --text-dim:         #5a6a7a;  /* Tertiary/labels */
  
  /* Borders & separation */
  --border:           #1e2730;  /* (old, unused now) */
  --border-soft:      rgba(30, 39, 48, 0.5);  /* Current */
  
  /* Typography */
  --font-serif:       'Merriweather', serif;
  --font-body:        'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono:        'Menlo', 'Consolas', monospace;
  
  /* Spacing scale (optional, for consistency) */
  --space-xs:         4px;
  --space-sm:         8px;
  --space-md:         16px;
  --space-lg:         24px;
  --space-xl:         32px;
  --space-2xl:        48px;
  
  /* Timing */
  --transition-fast:  0.15s ease;
  --transition-normal: 0.3s ease;
  --transition-slow:  0.5s ease;
}
```

---

### Testing Checklist for Custom Mods

After making changes, verify:

- [ ] Nav links are readable on hover
- [ ] Post cards have clear focus state
- [ ] Code blocks are visible and distinct
- [ ] Status badges (buff/nerf/fix) stand out appropriately
- [ ] Text has sufficient contrast (WCAG AA minimum)
- [ ] Font sizes are consistent across similar elements
- [ ] Spacing feels balanced (not cramped, not floating away)
- [ ] Colors print decently (if applicable)
- [ ] Mobile view is responsive and readable

---

### Browser DevTools Tips

1. **Test color contrasts:** DevTools → Accessibility panel
2. **Check responsive:** Toggle device toolbar (Ctrl+Shift+M or Cmd+Shift+M)
3. **Simulate hover:** Right-click element → `:hover` in DevTools
4. **Compare palettes:** Change `--accent` temporarily to see cascading effects
5. **Find all uses of a color:** Use DevTools search in computed styles

---

## Common Customization Workflows

### "I want it warmer"
```
1. Increase --accent brightness (+10%)
2. Shift --buff and --nerf toward warm tones (increase red/yellow)
3. Reduce --text-secondary brightness (more color pop)
```

### "I want it more tech-forward again"
```
1. Revert --accent to #00d4ff (bright cyan)
2. Revert --buff to #39ff88, --nerf to #ff4d6b
3. Increase letter-spacing on headings (0.05em-0.1em)
4. Switch fonts back to 'Roboto'
```

### "I want it even more editorial"
```
1. Use serif for more elements (post-meta, section titles)
2. Increase line-height to 1.9
3. Reduce max-width to 900px
4. Add subtle texture/noise
5. Use Georgia or Lora for serif
```

### "I want it more minimalist"
```
1. Reduce --border-soft opacity to 0.2 (nearly invisible borders)
2. Remove all animations (set animation-delay: 0)
3. Remove hover effects (no transform, only color change)
4. Increase whitespace/padding
```

---

## Color Accessibility

**Current palette WCAG AAA compliant for:**
- ✓ Text on dark background (#d8dce5 on #17161C)
- ✓ Accent colors for alerts/UI elements
- ✓ Accent text on colored backgrounds

**Test tools:**
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Browser DevTools → Accessibility panel
- [Coolors.co](https://coolors.co/contrast-checker)

---

## Performance Notes

**Current CSS is optimized for:**
- ✓ No external dependencies (fonts imported from Google)
- ✓ Minimal use of transforms (performance-friendly)
- ✓ Efficient color variables (3-4 color variables, many derivatives)
- ✓ Hardware-accelerated transitions (3D transforms where used)

**If adding heavy effects:**
- Use `will-change` sparingly
- Prefer `opacity` and `color` over `box-shadow` for animations
- Use `transform: translateZ(0)` for mobile performance

---

## Quick Color Palette Templates

### If You Want a Different Era Feel

**1990s Nostalgia (Warmer, Earthier)**
```css
--accent:       #8A7F6E;  /* Tan/brown */
--buff:         #6B8E5A;  /* Olive green */
--nerf:         #A85A5A;  /* Dusty red */
--fix:          #D4A574;  /* Terracotta */
```

**Cyberpunk/synthwave (Keeping Neon Feel)**
```css
--accent:       #00F7FF;  /* Restore bright cyan */
--buff:         #39FF88;  /* Restore bright green */
--nerf:         #FF006E;  /* Restore hot pink */
--fix:          #FFD60A;  /* Restore bright yellow */
```

**Sepia/Warm Retro**
```css
--accent:       #8B7355;  /* Brown-tan */
--buff:         #9B8B6F;  /* Light brown */
--nerf:         #A5555E;  /* Dusty burgundy */
--fix:          #C9A85F;  /* Warm gold */
```

---

## Final Notes

- **All changes in `:root`** cascade throughout the site
- **Test in multiple browsers** (Chrome, Firefox, Safari)
- **Check mobile** before deploying
- **Keep backup** of current CSS before major changes
- **Use browser DevTools** to live-test color changes

Good luck with your customizations! 🎨
