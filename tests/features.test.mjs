import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSearchQuery,
  expandSearchQueryVariants,
  damerauLevenshtein,
  fuzzyScoreTitle,
  identityKeys,
  SEARCH_ALIAS_MAP,
} from '../src/runtime/searchNormalizer.js';

import {
  isEligibleRecommendationCandidate,
  computeSeedWeight,
  candidateQualityReward,
  scoreCandidateAgainstSeed,
  franchiseKey,
  applyDiversityCaps,
  rankCandidatesForSeed,
  rankTopPicksCandidates,
  buildRecommendationRows,
  MAX_PER_PERSON,
} from '../src/runtime/recommendations.js';

import {
  isSourceReady,
  sourceResolutionLabel,
  sourceAudioLabel,
  sourceBitrateLabel,
  StreamPickerOverlay,
} from '../src/ui/overlays/streamPicker.js';

import {
  PREFETCH_WINDOW_MS,
  normalizeSourceId,
  markLocalSourceWarm,
  getLocalWarmedSources,
  getWarmSources,
  prefetchStreams,
  warmSecondSource,
  warmFirstBytes,
  searchFuzzy,
  getSearchSuggestions,
} from '../src/data/api.js';

test('searchNormalizer: normalizeSearchQuery diacritics and ligatures', () => {
  assert.equal(normalizeSearchQuery('Café René'), 'cafe rene');
  assert.equal(normalizeSearchQuery('Straße'), 'strasse');
  assert.equal(normalizeSearchQuery('Spider-Man: No Way Home!'), 'spider man no way home');
  assert.equal(normalizeSearchQuery("It's Always Sunny"), 'its always sunny');
  assert.equal(normalizeSearchQuery('Fast & Furious'), 'fast and furious');
  assert.equal(normalizeSearchQuery(''), '');
  assert.equal(normalizeSearchQuery(null), '');
});

test('searchNormalizer: expandSearchQueryVariants aliases, compounds, numbers', () => {
  const lotrVariants = expandSearchQueryVariants('lotr');
  assert.ok(lotrVariants.includes('The Lord of the Rings'));

  const gotVariants = expandSearchQueryVariants('got');
  assert.ok(gotVariants.includes('Game of Thrones'));

  const spidermanVariants = expandSearchQueryVariants('spider-man');
  assert.ok(spidermanVariants.some((v) => v.toLowerCase() === 'spiderman'));
  assert.ok(spidermanVariants.some((v) => v.toLowerCase() === 'spider man'));

  const b99Variants = expandSearchQueryVariants('b99');
  assert.ok(b99Variants.includes('Brooklyn Nine-Nine'));

  const numberVariants = expandSearchQueryVariants('iron man 2');
  assert.ok(numberVariants.some((v) => v.includes('two') || v.includes('ii')));
});

test('searchNormalizer: damerauLevenshtein transposition and distance', () => {
  assert.equal(damerauLevenshtein('', ''), 0);
  assert.equal(damerauLevenshtein('test', 'test'), 0);
  assert.equal(damerauLevenshtein('cat', 'hat'), 1);
  // Adjacent transposition
  assert.equal(damerauLevenshtein('ca', 'ac'), 1);
  assert.equal(damerauLevenshtein('spider', 'spidre'), 1);
});

test('searchNormalizer: fuzzyScoreTitle fuzzy and exact scoring', () => {
  assert.equal(fuzzyScoreTitle('Avatar', 'Avatar'), 1.0);
  assert.equal(fuzzyScoreTitle('Avatar', 'The Avatar'), 0.98);

  const typoScore = fuzzyScoreTitle('spidre man', 'Spider-Man');
  assert.ok(typoScore > 0.80, `Expected typoScore > 0.80, got ${typoScore}`);

  const aliasScore = fuzzyScoreTitle('lotr', 'The Lord of the Rings: The Fellowship of the Ring');
  assert.ok(aliasScore > 0.70, `Expected aliasScore > 0.70, got ${aliasScore}`);

  const unrelated = fuzzyScoreTitle('Star Wars', 'The Godfather');
  assert.ok(unrelated < 0.40, `Expected unrelated < 0.40, got ${unrelated}`);
});

test('searchNormalizer: identityKeys extraction', () => {
  const movie = {
    Id: 'mov123',
    Type: 'Movie',
    Name: 'The Dark Knight',
    ProductionYear: 2008,
    ProviderIds: { Tmdb: '155', Imdb: 'tt0468569' },
  };
  const keys = identityKeys(movie);
  assert.ok(keys.includes('id:mov123'));
  assert.ok(keys.includes('tmdb:movie:155'));
  assert.ok(keys.includes('imdb:tt0468569'));
});

test('recommendations: isEligibleRecommendationCandidate filtering', () => {
  assert.equal(isEligibleRecommendationCandidate(null), false);
  assert.equal(isEligibleRecommendationCandidate({ Id: '1' }), true);
  // Filter out disliked items
  assert.equal(isEligibleRecommendationCandidate({ Id: '2', UserData: { Likes: false } }), false);
  // Filter out already played
  assert.equal(isEligibleRecommendationCandidate({ Id: '3', UserData: { Played: true } }), false);
  // Filter out rating < 6.0
  assert.equal(isEligibleRecommendationCandidate({ Id: '4', CommunityRating: 5.5 }), false);
  assert.equal(isEligibleRecommendationCandidate({ Id: '5', CommunityRating: 7.8 }), true);
  // Excluded ID set
  assert.equal(isEligibleRecommendationCandidate({ Id: '6' }, new Set(['6'])), false);
});

test('recommendations: computeSeedWeight explicit like and recency decay', () => {
  const now = Date.now();
  const unliked = { Id: '1', UserData: { Likes: null, LastPlayedDate: new Date(now).toISOString() } };
  const liked = { Id: '2', UserData: { Likes: true, LastPlayedDate: new Date(now).toISOString() } };

  const weightUnliked = computeSeedWeight(unliked, now);
  const weightLiked = computeSeedWeight(liked, now);
  assert.ok(Math.abs(weightLiked / weightUnliked - 2.5) < 0.05, 'Expected ~2.5x like boost');

  const oldSeed = {
    Id: '3',
    UserData: { Likes: null, LastPlayedDate: new Date(now - 21 * 24 * 3600 * 1000).toISOString() },
  };
  const weightOld = computeSeedWeight(oldSeed, now);
  assert.ok(weightOld < weightUnliked * 0.45, 'Expected 21-day exponential recency decay');
});

test('recommendations: scoreCandidateAgainstSeed non-zero when genre overlap is 0 but director or actor matches', () => {
  const seed = {
    Id: 's1',
    Genres: ['Action'],
    People: [{ Id: 'dir1', Name: 'Christopher Nolan', Type: 'Director' }],
  };
  const candidate = {
    Id: 'c1',
    Genres: ['Drama'], // 0 genre overlap
    People: [{ Id: 'dir1', Name: 'Christopher Nolan', Type: 'Director' }],
  };

  const { similarity, matchedPeople } = scoreCandidateAgainstSeed(seed, candidate);
  assert.ok(similarity > 0, 'Expected non-zero similarity via director match despite 0 genre overlap');
  assert.ok(matchedPeople.includes('dir1'));
});

test('recommendations: franchiseKey and applyDiversityCaps MAX_PER_PERSON', () => {
  assert.equal(franchiseKey({ Id: '1', Name: 'Dune: Part Two' }), 'dune');
  assert.equal(franchiseKey({ Id: '2', Name: 'John Wick: Chapter 4' }), 'john wick');

  const entries = [
    { item: { Id: 'm1', People: [{ Id: 'nolan', Type: 'Director' }] }, matchedPeople: ['nolan'] },
    { item: { Id: 'm2', People: [{ Id: 'nolan', Type: 'Director' }] }, matchedPeople: ['nolan'] },
    { item: { Id: 'm3', People: [{ Id: 'nolan', Type: 'Director' }] }, matchedPeople: ['nolan'] },
    { item: { Id: 'm4', People: [{ Id: 'nolan', Type: 'Director' }] }, matchedPeople: ['nolan'] },
  ];

  const capped = applyDiversityCaps(entries, { maxPerPerson: MAX_PER_PERSON, limit: 10 });
  assert.equal(capped.length, MAX_PER_PERSON, `Expected at most ${MAX_PER_PERSON} items per person`);
});

test('recommendations: buildRecommendationRows computes Top Picks first and excludes from Because You Watched', () => {
  const seeds = [
    {
      Id: 'seed1',
      Name: 'Interstellar',
      Genres: ['Sci-Fi'],
      People: [{ Id: 'nolan', Type: 'Director' }],
      UserData: { Likes: true, PlayCount: 3 },
    },
  ];

  const candidatePool = [
    {
      Id: 'cand1',
      Name: 'Inception',
      Genres: ['Sci-Fi'],
      People: [{ Id: 'nolan', Type: 'Director' }],
      CommunityRating: 8.8,
    },
    {
      Id: 'cand2',
      Name: 'Tenet',
      Genres: ['Sci-Fi'],
      People: [{ Id: 'nolan', Type: 'Director' }],
      CommunityRating: 7.5,
    },
    {
      Id: 'cand3',
      Name: 'Memento',
      Genres: ['Thriller'],
      People: [{ Id: 'nolan', Type: 'Director' }],
      CommunityRating: 8.4,
    },
  ];

  const backendTopPicks = [
    { Id: 'cand1', Name: 'Inception', CommunityRating: 8.8 },
  ];

  const { topPicks, becauseYouWatchedRows } = buildRecommendationRows({
    seeds,
    candidatePool,
    backendTopPicks,
    maxTopPicks: 1,
    maxPerRow: 5,
  });

  assert.equal(topPicks.length, 1);
  assert.equal(topPicks[0].Id, 'cand1');

  // Because cand1 was consumed by Top Picks, becauseYouWatchedRows must not contain cand1
  if (becauseYouWatchedRows.length > 0) {
    const rowItemIds = becauseYouWatchedRows[0].items.map((i) => i.Id);
    assert.equal(rowItemIds.includes('cand1'), false);
  }
});

test('streamPicker: isSourceReady and Ready badge logic', () => {
  const source = { Id: 'src-123-abc' };
  assert.equal(isSourceReady(source, null), false);

  // Set of normalized IDs
  const readySet = new Set(['src123abc']);
  assert.equal(isSourceReady(source, readySet), true);

  // Object / Map mapping
  const readyObj = { src123abc: true };
  assert.equal(isSourceReady(source, readyObj), true);

  // Negative check
  assert.equal(isSourceReady({ Id: 'other-source' }, readyObj), false);
});

test('streamPicker: StreamPickerOverlay renders Ready badge pill when readyInfo is present', () => {
  const sources = [
    { Id: 'src1', Name: '4K Source', SupportsDirectPlay: true, MediaStreams: [{ Type: 'Video', Height: 2160 }] },
    { Id: 'src2', Name: '1080p Source', SupportsDirectPlay: false, MediaStreams: [{ Type: 'Video', Height: 1080 }] },
  ];

  const overlay = new StreamPickerOverlay({
    item: { Id: 'item1', Name: 'Test Movie' },
    sources,
    readyInfo: { src1: true },
  });

  // Mock DOM
  const prevDoc = globalThis.document;
  class MockElement {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = new Map();
      this.innerHTMLContent = '';
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener() {}
    set innerHTML(h) { this.innerHTMLContent = h; }
    get innerHTML() { return this.innerHTMLContent; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    closest() { return null; }
    focus() {}
    remove() {}
  }
  const root = new MockElement('div');
  globalThis.document = {
    createElement: (t) => new MockElement(t),
    getElementById: (id) => (id === 'jellio-overlay-root' ? root : null),
  };

  overlay.show();
  assert.ok(overlay.container.innerHTML.includes('jellio-stream-ready-badge'));
  assert.ok(overlay.container.innerHTML.includes('Ready'));

  globalThis.document = prevDoc;
});

test('api: prefetchStreams TTL window and warm helpers', async () => {
  normalizeSourceId('abc-def-123');
  assert.equal(normalizeSourceId('ABC-DEF-123'), 'abcdef123');

  markLocalSourceWarm('item99', 'src-alpha-1');
  const local = getLocalWarmedSources('item99');
  assert.ok(local && local.srcalpha1 === true);

  // warmSecondSource returns timer handle when >= 2 sources
  const timer = warmSecondSource('item100', [{ Id: 's1' }, { Id: 's2' }]);
  assert.ok(timer !== null);
  clearTimeout(timer);

  // warmSecondSource returns null when < 2 sources
  const noTimer = warmSecondSource('item100', [{ Id: 's1' }]);
  assert.equal(noTimer, null);

  // warmFirstBytes executes without error
  await warmFirstBytes('http://localhost:8096/Videos/123/stream.mp4');

  assert.equal(PREFETCH_WINDOW_MS, 8 * 60 * 1000);
});
