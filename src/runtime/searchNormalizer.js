// Typo-tolerant search normalization, alias/number/hyphen query expansion,
// and Damerau-Levenshtein fuzzy title scoring.

export const SEARCH_ALIAS_MAP = Object.freeze({
  lotr: 'The Lord of the Rings',
  got: 'Game of Thrones',
  hotd: 'House of the Dragon',
  aot: 'Attack on Titan',
  jjk: 'Jujutsu Kaisen',
  mha: 'My Hero Academia',
  fmab: 'Fullmetal Alchemist Brotherhood',
  b99: 'Brooklyn Nine-Nine',
  himym: 'How I Met Your Mother',
  tbbt: 'The Big Bang Theory',
  iasip: "It's Always Sunny in Philadelphia",
  sw: 'Star Wars',
  hp: 'Harry Potter',
});

const COMPOUND_PAIRS = [
  ['spiderman', 'spider-man', 'spider man'],
  ['starwars', 'star wars', 'star-wars'],
  ['batman', 'bat-man', 'bat man'],
  ['ironman', 'iron-man', 'iron man'],
  ['antman', 'ant-man', 'ant man'],
  ['superman', 'super-man', 'super man'],
  ['xmen', 'x-men', 'x men'],
  ['catwoman', 'cat-woman', 'cat woman'],
  ['wonderwoman', 'wonder woman', 'wonder-woman'],
  ['ghostbusters', 'ghost busters', 'ghost-busters'],
  ['dragonball', 'dragon ball', 'dragon-ball'],
];

const NUMBER_EQUIVALENCE_GROUPS = [
  ['1', 'one', 'i'],
  ['2', 'two', 'ii'],
  ['3', 'three', 'iii'],
  ['4', 'four', 'iv'],
  ['5', 'five', 'v'],
  ['6', 'six', 'vi'],
  ['7', 'seven', 'vii'],
  ['8', 'eight', 'viii'],
  ['9', 'nine', 'ix'],
  ['10', 'ten', 'x'],
  ['99', 'nine-nine', 'nine nine'],
];

const TOKEN_EQUIVALENTS = new Map();
for (const group of NUMBER_EQUIVALENCE_GROUPS) {
  for (const term of group) {
    const key = term.toLowerCase();
    if (!TOKEN_EQUIVALENTS.has(key)) {
      TOKEN_EQUIVALENTS.set(key, []);
    }
    for (const alt of group) {
      if (alt.toLowerCase() !== key) {
        TOKEN_EQUIVALENTS.get(key).push(alt.toLowerCase());
      }
    }
  }
}

export function normalizeSearchQuery(q) {
  if (q == null) return '';
  let str = String(q);

  // NFD diacritic folding and common ligature/letter replacements
  str = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/Æ|æ/g, 'ae')
    .replace(/Œ|œ/g, 'oe')
    .replace(/Ø|ø/g, 'o')
    .replace(/Ł|ł/g, 'l');

  // Remove smart and straight apostrophes so contractions collapse cleanly (e.g. It's -> its)
  str = str.replace(/['\u2018\u2019\u201B`´]/g, '');

  // Ampersand to 'and'
  str = str.replace(/&/g, ' and ');

  // Normalize hyphens and punctuation to single spaces
  str = str
    .toLowerCase()
    .replace(/[-_:/\\.,!?()[\]{}"+;*#@~^|<>]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return str;
}

export function expandSearchQueryVariants(q) {
  if (q == null) return [];
  const raw = String(q).trim();
  if (!raw) return [];

  const variants = [];
  const seen = new Set();

  const addVariant = (val) => {
    if (!val) return;
    const trimmed = String(val).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      variants.push(trimmed);
    }
  };

  const normalized = normalizeSearchQuery(raw);
  const rawLower = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Direct alias & initialism lookup
  if (SEARCH_ALIAS_MAP[rawLower]) {
    addVariant(SEARCH_ALIAS_MAP[rawLower]);
    addVariant(normalizeSearchQuery(SEARCH_ALIAS_MAP[rawLower]));
  }
  if (SEARCH_ALIAS_MAP[normalized]) {
    addVariant(SEARCH_ALIAS_MAP[normalized]);
    addVariant(normalizeSearchQuery(SEARCH_ALIAS_MAP[normalized]));
  }

  // Keep raw and normalized query
  addVariant(raw);
  addVariant(normalized);

  // Token-level alias expansion if first token is an alias (e.g. "lotr two towers" or "hp 3")
  const rawTokens = normalized.split(' ').filter(Boolean);
  if (rawTokens.length > 1 && SEARCH_ALIAS_MAP[rawTokens[0]]) {
    const expandedPrefix = SEARCH_ALIAS_MAP[rawTokens[0]];
    const rest = rawTokens.slice(1).join(' ');
    addVariant(`${expandedPrefix} ${rest}`);
    addVariant(normalizeSearchQuery(`${expandedPrefix} ${rest}`));
  }

  // 2. Compound / hyphen variants
  for (const group of COMPOUND_PAIRS) {
    for (const form of group) {
      const regex = new RegExp(`\\b${form.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(rawLower) || regex.test(normalized)) {
        for (const replacement of group) {
          if (regex.test(rawLower)) {
            addVariant(rawLower.replace(regex, replacement));
          }
          if (regex.test(normalized)) {
            addVariant(normalized.replace(regex, replacement));
          }
        }
      }
    }
  }

  // Generic hyphen <-> space <-> joined compound expansion when input has a hyphen
  if (rawLower.includes('-')) {
    addVariant(rawLower.replace(/-/g, ' ').replace(/\s+/g, ' ').trim());
    addVariant(rawLower.replace(/-/g, '').replace(/\s+/g, ' ').trim());
  }

  // 3. Bidirectional number <-> word <-> Roman numeral variants
  // Check multi-word number phrases first (e.g. "nine-nine" / "nine nine" <-> "99")
  const snapshot = [...variants];
  for (const base of snapshot) {
    const lowerBase = base.toLowerCase();
    if (/\bnine[- ]nine\b/.test(lowerBase)) {
      addVariant(lowerBase.replace(/\bnine[- ]nine\b/g, '99'));
      addVariant(lowerBase.replace(/\bnine[- ]nine\b/g, 'nine-nine'));
      addVariant(lowerBase.replace(/\bnine[- ]nine\b/g, 'nine nine'));
    }
    if (/\b99\b/.test(lowerBase)) {
      addVariant(lowerBase.replace(/\b99\b/g, 'nine-nine'));
      addVariant(lowerBase.replace(/\b99\b/g, 'nine nine'));
    }

    const tokens = lowerBase.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const alts = TOKEN_EQUIVALENTS.get(tok);
      if (alts && alts.length > 0) {
        // Avoid expanding standalone single-letter "i" or "v" or "x" unless it is not the first word
        if ((tok === 'i' || tok === 'v' || tok === 'x') && i === 0 && tokens.length === 1) {
          continue;
        }
        for (const alt of alts) {
          const copy = [...tokens];
          copy[i] = alt;
          addVariant(copy.join(' '));
        }
      }
    }
  }

  return variants;
}

export function damerauLevenshtein(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  if (s1 === s2) return 0;

  const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      let best = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );

      // Adjacent transposition
      if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
        best = Math.min(best, dp[i - 2][j - 2] + 1);
      }

      dp[i][j] = best;
    }
  }

  return dp[len1][len2];
}

function scoreSingleQueryAgainstTitle(normQuery, normTitle) {
  if (!normQuery || !normTitle) return 0;
  if (normQuery === normTitle) return 1.0;

  // Strip leading articles for comparison
  const stripArticle = (s) => s.replace(/^(the|a|an)\s+/, '');
  const qNoArt = stripArticle(normQuery);
  const tNoArt = stripArticle(normTitle);

  if (qNoArt && qNoArt === tNoArt) return 0.98;

  // Prefix / substring match
  if (normTitle.startsWith(normQuery) || tNoArt.startsWith(qNoArt)) {
    const ratio = qNoArt.length / Math.max(tNoArt.length, 1);
    return 0.85 + Math.min(0.12, ratio * 0.12);
  }
  if (normTitle.includes(normQuery) && normQuery.length >= 3) {
    const ratio = normQuery.length / Math.max(normTitle.length, 1);
    return 0.75 + Math.min(0.15, ratio * 0.15);
  }

  // Whole-string edit distance
  const maxLen = Math.max(qNoArt.length, tNoArt.length);
  const fullDist = damerauLevenshtein(qNoArt, tNoArt);
  const fullSim = maxLen > 0 ? 1 - fullDist / maxLen : 0;

  // Token-by-token best fuzzy alignment
  const qTokens = qNoArt.split(' ').filter(Boolean);
  const tTokens = tNoArt.split(' ').filter(Boolean);

  if (qTokens.length === 0 || tTokens.length === 0) return Math.max(0, fullSim);

  let tokenScoreSum = 0;
  for (const qt of qTokens) {
    let bestTokSim = 0;
    for (const tt of tTokens) {
      if (qt === tt) {
        bestTokSim = 1.0;
        break;
      }
      if (tt.startsWith(qt) && qt.length >= 3) {
        bestTokSim = Math.max(bestTokSim, 0.88);
      }
      const dist = damerauLevenshtein(qt, tt);
      const denom = Math.max(qt.length, tt.length);
      const sim = denom > 0 ? 1 - dist / denom : 0;
      if (sim > bestTokSim) bestTokSim = sim;
    }
    tokenScoreSum += bestTokSim;
  }

  const avgTokenSim = tokenScoreSum / qTokens.length;
  const coveragePenalty = qTokens.length < tTokens.length
    ? Math.min(0.08, (tTokens.length - qTokens.length) * 0.02)
    : 0;

  const combined = Math.max(fullSim, avgTokenSim - coveragePenalty);
  return Math.max(0, Math.min(1, combined));
}

export function fuzzyScoreTitle(query, candidateTitle) {
  if (!query || !candidateTitle) return 0;
  const normCandidate = normalizeSearchQuery(candidateTitle);
  if (!normCandidate) return 0;

  const variants = expandSearchQueryVariants(query);
  if (variants.length === 0) return 0;

  let best = 0;
  for (let i = 0; i < variants.length; i++) {
    const normVar = normalizeSearchQuery(variants[i]);
    if (!normVar) continue;
    const score = scoreSingleQueryAgainstTitle(normVar, normCandidate);
    if (score > best) best = score;
    if (best >= 1.0) break;
  }

  return best;
}

export function identityKeys(item) {
  if (!item) return [];
  const keys = [];
  if (item.Id) keys.push(`id:${String(item.Id).toLowerCase()}`);
  const tmdb = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.TmdbId || item.tmdbId;
  const type = (item.Type || item.MediaType || '').toLowerCase();
  if (tmdb) keys.push(`tmdb:${type}:${String(tmdb).toLowerCase()}`);
  const imdb = item.ProviderIds?.Imdb || item.ProviderIds?.imdb || item.ImdbId || item.imdbId;
  if (imdb) keys.push(`imdb:${String(imdb).toLowerCase()}`);
  const normName = normalizeSearchQuery(item.Name || item.Title || '');
  const year = item.ProductionYear || item.Year || '';
  if (normName) {
    keys.push(`title:${type}:${normName}:${year}`);
  }
  return keys;
}
