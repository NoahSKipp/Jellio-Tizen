// Multi-signal recommendation scoring engine for "Top Picks for You"
// and "Because you watched" rows.
import { normalizeSearchQuery } from './searchNormalizer.js';

export const MAX_PER_PERSON = 2;
export const MIN_COMMUNITY_RATING = 6.0;
export const RECENCY_DECAY_DAYS = 21;
export const LIKE_WEIGHT_MULTIPLIER = 2.5;
export const MULTI_SEED_COOCCURRENCE_BOOST = 1.5;
export const QUALITY_REWARD_MULTIPLIER = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isEligibleRecommendationCandidate(candidate, excludeIds = null) {
  if (!candidate || !candidate.Id) return false;
  if (excludeIds && excludeIds.has(candidate.Id)) return false;

  const userData = candidate.UserData || {};
  if (userData.Likes === false) return false;
  if (userData.Played === true) return false;

  if (
    typeof candidate.CommunityRating === 'number' &&
    !Number.isNaN(candidate.CommunityRating) &&
    candidate.CommunityRating < MIN_COMMUNITY_RATING
  ) {
    return false;
  }

  return true;
}

export function computeSeedWeight(seed, nowMs = Date.now()) {
  if (!seed) return 1.0;
  const userData = seed.UserData || {};

  // 1. Explicit like boost (2.5x)
  const likeMultiplier = userData.Likes === true ? LIKE_WEIGHT_MULTIPLIER : 1.0;

  // 2. 21-day exponential recency decay
  let recencyMultiplier = 1.0;
  const rawDate = userData.LastPlayedDate || seed.DatePlayed || seed.LastPlayedDate || null;
  if (rawDate) {
    const playedMs = typeof rawDate === 'number' ? rawDate : Date.parse(rawDate);
    if (!Number.isNaN(playedMs) && playedMs > 0) {
      const ageDays = Math.max(0, (nowMs - playedMs) / DAY_MS);
      recencyMultiplier = Math.exp(-ageDays / RECENCY_DECAY_DAYS);
    }
  }

  // 3. Rewatch / binge count boost
  const playCount = Math.max(
    1,
    Number(userData.PlayCount) || 1,
    Number(seed._bingeEpisodeCount) || 1
  );
  const rewatchMultiplier = 1 + Math.min(1.0, Math.log2(playCount) * 0.35);

  return likeMultiplier * recencyMultiplier * rewatchMultiplier;
}

function extractPeopleByRole(item) {
  const directors = new Set();
  const actors = new Set();
  const allPeople = [];

  const people = Array.isArray(item?.People) ? item.People : [];
  for (const p of people) {
    if (!p) continue;
    const key = String(p.Id || p.Name || '').toLowerCase().trim();
    if (!key) continue;
    allPeople.push(key);
    const type = String(p.Type || p.Role || '').toLowerCase();
    if (type === 'director') {
      directors.add(key);
    } else {
      actors.add(key);
    }
  }

  return { directors, actors, allPeople };
}

function extractStudios(item) {
  const studios = new Set();
  const list = Array.isArray(item?.Studios) ? item.Studios : [];
  for (const s of list) {
    if (!s) continue;
    const name = typeof s === 'string' ? s : (s.Name || s.Id || '');
    const key = String(name).toLowerCase().trim();
    if (key) studios.add(key);
  }
  return studios;
}

function extractGenres(item) {
  const genres = new Set();
  const list = Array.isArray(item?.Genres) ? item.Genres : [];
  for (const g of list) {
    if (!g) continue;
    const key = String(g).toLowerCase().trim();
    if (key) genres.add(key);
  }
  return genres;
}

function extractTags(item) {
  const tags = new Set();
  const list = Array.isArray(item?.Tags) ? item.Tags : [];
  for (const t of list) {
    if (!t) continue;
    const key = String(t).toLowerCase().trim();
    if (key) tags.add(key);
  }
  return tags;
}

export function candidateQualityReward(candidate) {
  const rating = Number(candidate?.CommunityRating);
  if (!Number.isFinite(rating) || rating <= 0) return 0;
  return (Math.min(10, rating) / 10) * QUALITY_REWARD_MULTIPLIER;
}

export function scoreCandidateAgainstSeed(seed, candidate) {
  if (!seed || !candidate || seed.Id === candidate.Id) {
    return { similarity: 0, matchedPeople: [] };
  }

  const seedGenres = extractGenres(seed);
  const candGenres = extractGenres(candidate);
  let genreMatches = 0;
  for (const g of candGenres) {
    if (seedGenres.has(g)) genreMatches++;
  }

  const seedPeople = extractPeopleByRole(seed);
  const candPeople = extractPeopleByRole(candidate);
  const matchedPeople = [];

  let directorMatches = 0;
  for (const d of candPeople.directors) {
    if (seedPeople.directors.has(d)) {
      directorMatches++;
      matchedPeople.push(d);
    }
  }

  let actorMatches = 0;
  for (const a of candPeople.actors) {
    if (seedPeople.actors.has(a)) {
      actorMatches++;
      matchedPeople.push(a);
    }
  }

  const seedStudios = extractStudios(seed);
  const candStudios = extractStudios(candidate);
  let studioMatches = 0;
  for (const s of candStudios) {
    if (seedStudios.has(s)) studioMatches++;
  }

  const seedTags = extractTags(seed);
  const candTags = extractTags(candidate);
  let tagMatches = 0;
  for (const t of candTags) {
    if (seedTags.has(t)) tagMatches++;
  }

  // Allow director, actor, studio, or tag matches even when genre overlap is 0
  const hasContentSignal =
    genreMatches > 0 ||
    directorMatches > 0 ||
    actorMatches > 0 ||
    studioMatches > 0 ||
    tagMatches > 0;

  if (!hasContentSignal) {
    return { similarity: 0, matchedPeople: [] };
  }

  let similarity = 0;
  similarity += genreMatches * 2.0;
  similarity += directorMatches * 3.2;
  similarity += Math.min(3, actorMatches) * 1.8;
  similarity += Math.min(2, studioMatches) * 2.0;
  similarity += Math.min(3, tagMatches) * 1.0;

  if (seed.Type && candidate.Type && seed.Type === candidate.Type) {
    similarity += 0.4;
  }

  return { similarity, matchedPeople };
}

export function franchiseKey(item) {
  if (!item) return '';
  if (item.SeriesId) return `series:${String(item.SeriesId).toLowerCase()}`;
  if (item.CollectionId) return `col:${String(item.CollectionId).toLowerCase()}`;
  const tmdbCol = item.ProviderIds?.TmdbCollection || item.ProviderIds?.tmdbCollection;
  if (tmdbCol) return `tmdbcol:${String(tmdbCol).toLowerCase()}`;

  let raw = String(item.SeriesName || item.Name || '').toLowerCase();
  // Strip subtitles after colon or dash (e.g. "Dune: Part Two" -> "dune", "John Wick: Chapter 4" -> "john wick")
  raw = raw.split(/\s*[:]\s*|\s+-\s+/)[0];
  let norm = normalizeSearchQuery(raw);
  // Strip trailing sequel markers ("part 2", "chapter 3", "vol 2", trailing numbers or Roman numerals)
  norm = norm
    .replace(/\b(part|chapter|volume|vol|season|book)\s+([0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|i|ii|iii|iv|v|vi|vii|viii|ix|x)\b$/i, '')
    .replace(/\s+([2-9]|1[0-9]|ii|iii|iv|v|vi|vii|viii|ix|x)$/i, '')
    .trim();

  return norm || String(item.Id || '').toLowerCase();
}

function getCandidateKeyPeople(candidate, matchedPeople = []) {
  const { directors, actors } = extractPeopleByRole(candidate);
  const keySet = new Set(matchedPeople || []);
  for (const d of Array.from(directors).slice(0, 1)) keySet.add(d);
  for (const a of Array.from(actors).slice(0, 2)) keySet.add(a);
  return Array.from(keySet);
}

export function applyDiversityCaps(scoredEntries, options = {}) {
  const limit = options.limit || 20;
  const maxPerPerson = options.maxPerPerson || MAX_PER_PERSON;
  const deduplicateFranchises = options.deduplicateFranchises !== false;

  const personCounts = new Map();
  const seenFranchises = new Set();
  const seenIds = new Set();
  const result = [];

  for (const entry of scoredEntries) {
    const item = entry.item || entry;
    if (!item || !item.Id || seenIds.has(item.Id)) continue;

    if (deduplicateFranchises) {
      const fKey = franchiseKey(item);
      if (fKey && seenFranchises.has(fKey)) continue;
    }

    const keyPeople = getCandidateKeyPeople(item, entry.matchedPeople);
    let personCapReached = false;
    for (const pid of keyPeople) {
      if ((personCounts.get(pid) || 0) >= maxPerPerson) {
        personCapReached = true;
        break;
      }
    }
    if (personCapReached) continue;

    seenIds.add(item.Id);
    if (deduplicateFranchises) {
      const fKey = franchiseKey(item);
      if (fKey) seenFranchises.add(fKey);
    }
    for (const pid of keyPeople) {
      personCounts.set(pid, (personCounts.get(pid) || 0) + 1);
    }

    result.push(item);
    if (result.length >= limit) break;
  }

  return result;
}

export function rankCandidatesForSeed(seed, candidates, options = {}) {
  const excludeIds = options.excludeIds ? new Set(options.excludeIds) : new Set();
  if (seed && seed.Id) excludeIds.add(seed.Id);

  const scored = [];
  for (const candidate of candidates || []) {
    if (!isEligibleRecommendationCandidate(candidate, excludeIds)) continue;
    const { similarity, matchedPeople } = scoreCandidateAgainstSeed(seed, candidate);
    if (similarity <= 0) continue;

    const quality = candidateQualityReward(candidate);
    const totalScore = similarity + quality;

    scored.push({
      item: candidate,
      score: totalScore,
      matchedPeople,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return applyDiversityCaps(scored, {
    limit: options.limit || 15,
    maxPerPerson: options.maxPerPerson || MAX_PER_PERSON,
    deduplicateFranchises: options.deduplicateFranchises !== false,
  });
}

export function rankTopPicksCandidates(seeds, candidates, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const excludeIds = options.excludeIds ? new Set(options.excludeIds) : new Set();
  const validSeeds = (seeds || []).filter((s) => s && s.Id && s.UserData?.Likes !== false);

  for (const s of validSeeds) {
    excludeIds.add(s.Id);
  }

  const seedWeights = validSeeds.map((seed) => ({
    seed,
    weight: computeSeedWeight(seed, nowMs),
  }));

  const aggregated = new Map();

  for (const candidate of candidates || []) {
    if (!isEligibleRecommendationCandidate(candidate, excludeIds)) continue;
    if (aggregated.has(candidate.Id)) continue;

    let weightedSimilaritySum = 0;
    let seedMatchCount = 0;
    const matchedPeopleSet = new Set();

    for (const { seed, weight } of seedWeights) {
      const { similarity, matchedPeople } = scoreCandidateAgainstSeed(seed, candidate);
      if (similarity > 0) {
        weightedSimilaritySum += similarity * weight;
        seedMatchCount += 1;
        for (const p of matchedPeople) matchedPeopleSet.add(p);
      }
    }

    if (seedMatchCount === 0 && seedWeights.length > 0) continue;

    const coOccurrenceBoost =
      seedMatchCount > 1 ? MULTI_SEED_COOCCURRENCE_BOOST * (seedMatchCount - 1) : 0;
    const qualityBoost = candidateQualityReward(candidate);

    const totalScore = weightedSimilaritySum + coOccurrenceBoost + qualityBoost;

    aggregated.set(candidate.Id, {
      item: candidate,
      score: totalScore,
      seedMatchCount,
      matchedPeople: Array.from(matchedPeopleSet),
    });
  }

  const scoredList = Array.from(aggregated.values()).sort((a, b) => b.score - a.score);

  return applyDiversityCaps(scoredList, {
    limit: options.limit || 20,
    maxPerPerson: options.maxPerPerson || MAX_PER_PERSON,
    deduplicateFranchises: true,
  });
}

export function buildRecommendationRows({
  seeds = [],
  candidatePool = [],
  backendTopPicks = [],
  excludeIds = new Set(),
  maxTopPicks = 20,
  maxPerRow = 15,
  maxSeedRows = 4,
  nowMs = Date.now(),
} = {}) {
  const workingExclude = new Set(excludeIds);
  for (const s of seeds || []) {
    if (s && s.Id) workingExclude.add(s.Id);
  }

  // 1. Compute "Top Picks for You" FIRST before individual "Because you watched" rows
  // consume items from workingExclude.
  const filteredBackend = (backendTopPicks || []).filter((item) =>
    isEligibleRecommendationCandidate(item, workingExclude)
  );

  const clientTopPicks = rankTopPicksCandidates(seeds, candidatePool, {
    excludeIds: workingExclude,
    limit: maxTopPicks,
    nowMs,
  });

  // Merge backend top picks and client-side scored top picks with franchise deduplication & person caps
  const mergedEntries = [];
  const seenInMerge = new Set();
  for (const item of [...filteredBackend, ...clientTopPicks]) {
    if (!item || !item.Id || seenInMerge.has(item.Id)) continue;
    seenInMerge.add(item.Id);
    mergedEntries.push({ item, score: 1, matchedPeople: [] });
  }

  const topPicks = applyDiversityCaps(mergedEntries, {
    limit: maxTopPicks,
    maxPerPerson: MAX_PER_PERSON,
    deduplicateFranchises: true,
  });

  for (const item of topPicks) {
    workingExclude.add(item.Id);
  }

  // 2. Build individual "Because you watched {Seed}" rows after Top Picks
  const becauseYouWatchedRows = [];
  const sortedSeeds = [...(seeds || [])]
    .filter((s) => s && s.Id && s.Name && s.UserData?.Likes !== false)
    .sort((a, b) => computeSeedWeight(b, nowMs) - computeSeedWeight(a, nowMs));

  for (const seed of sortedSeeds) {
    if (becauseYouWatchedRows.length >= maxSeedRows) break;
    const rowItems = rankCandidatesForSeed(seed, candidatePool, {
      excludeIds: workingExclude,
      limit: maxPerRow,
      maxPerPerson: MAX_PER_PERSON,
      deduplicateFranchises: true,
    });

    if (rowItems.length > 0) {
      for (const it of rowItems) {
        workingExclude.add(it.Id);
      }
      becauseYouWatchedRows.push({
        id: `because_watched_${seed.Id}`,
        title: `Because you watched ${seed.Name}`,
        seed,
        items: rowItems,
      });
    }
  }

  return {
    topPicks,
    becauseYouWatchedRows,
  };
}
