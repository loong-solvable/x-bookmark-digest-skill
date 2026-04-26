const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const FALLBACK_BOOKMARKS_QUERY_ID = "Fy0QMy4q_aZCpkO0PnyLYw";
const QUERY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const BOOKMARKS_URL = "https://x.com/i/bookmarks";
const GRAPHQL_ROOT = "https://x.com/i/api/graphql";
const FEATURES = {
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_enhance_cards_enabled: false,
};

function sanitizeQueryId(rawQueryId, fallbackQueryId = FALLBACK_BOOKMARKS_QUERY_ID) {
  return typeof rawQueryId === "string" && QUERY_ID_PATTERN.test(rawQueryId) ? rawQueryId : fallbackQueryId;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, init = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }
    if (!response.ok) {
      const detail = payload?.errors?.[0]?.message || payload?.error || text || `HTTP ${response.status}`;
      throw new Error(`Request failed (${response.status}) for ${url}: ${detail}`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out requesting ${url}`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timer);
  }
}

function buildBookmarksUrl(queryId, count, cursor) {
  const variables = {
    count,
    includePromotedContent: false,
  };
  if (cursor) variables.cursor = cursor;

  return `${GRAPHQL_ROOT}/${queryId}/Bookmarks?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(FEATURES))}`;
}

function unwrapTweetResult(result) {
  let current = result;
  for (let index = 0; index < 6 && current; index += 1) {
    if (current.tweet) {
      current = current.tweet;
      continue;
    }
    if (current.result) {
      current = current.result;
      continue;
    }
    break;
  }
  if (current?.__typename === "TweetWithVisibilityResults" && current.tweet) {
    return current.tweet;
  }
  return current;
}

function unwrapUserResult(result) {
  let current = result;
  for (let index = 0; index < 4 && current; index += 1) {
    if (current.result) {
      current = current.result;
      continue;
    }
    break;
  }
  return current;
}

function buildStatusUrl(screenName, statusId) {
  if (!screenName || !statusId) return null;
  return `https://x.com/${screenName}/status/${statusId}`;
}

function extractUrls(legacy) {
  return [...new Set((legacy?.entities?.urls || []).map((entry) => entry.expanded_url || entry.url).filter(Boolean))];
}

function extractHashtags(legacy) {
  return [...new Set((legacy?.entities?.hashtags || []).map((entry) => entry.text).filter(Boolean))];
}

function extractMedia(legacy) {
  return [
    ...new Set(
      (legacy?.extended_entities?.media || legacy?.entities?.media || [])
        .map((entry) => entry.media_url_https || entry.media_url || entry.expanded_url || entry.url)
        .filter(Boolean),
    ),
  ];
}

function extractBookmarkTweet(result, seen) {
  const tweet = unwrapTweetResult(result);
  if (!tweet?.rest_id || seen.has(tweet.rest_id)) {
    return null;
  }

  const legacy = tweet.legacy || {};
  const user = unwrapUserResult(tweet.core?.user_results?.result || tweet.core?.user_result?.result);
  const userLegacy = user?.legacy || {};
  const handle = userLegacy.screen_name || user?.core?.screen_name || null;
  const authorName = userLegacy.name || user?.core?.name || null;
  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;

  seen.add(tweet.rest_id);
  return {
    bookmark_id: tweet.rest_id,
    status_id: tweet.rest_id,
    status_url: buildStatusUrl(handle, tweet.rest_id),
    author_name: authorName,
    handle,
    text: noteText || legacy.full_text || "",
    raw_text_fallback: legacy.full_text || "",
    hashtags: extractHashtags(legacy),
    urls: extractUrls(legacy),
    media: extractMedia(legacy),
    quoted_status_urls: [],
    is_reply: Boolean(legacy.in_reply_to_status_id_str),
    language: legacy.lang || null,
    created_at: legacy.created_at || null,
    metrics: {
      likes: legacy.favorite_count || 0,
      retweets: legacy.retweet_count || 0,
      replies: legacy.reply_count || 0,
      quotes: legacy.quote_count || 0,
      bookmarks: legacy.bookmark_count || 0,
      views: Number.parseInt(tweet.views?.count || "0", 10) || 0,
    },
  };
}

function parseBookmarksResponse(payload, seen) {
  const tweets = [];
  let nextCursor = null;

  const instructions =
    payload?.data?.bookmark_timeline_v2?.timeline?.instructions ||
    payload?.data?.bookmark_timeline?.timeline?.instructions ||
    [];

  for (const instruction of instructions) {
    for (const entry of instruction.entries || []) {
      const content = entry.content;
      if (content?.entryType === "TimelineTimelineCursor" || content?.__typename === "TimelineTimelineCursor") {
        if (content.cursorType === "Bottom" || content.cursorType === "ShowMore") {
          nextCursor = content.value;
        }
        continue;
      }

      if (entry.entryId?.startsWith("cursor-bottom-") || entry.entryId?.startsWith("cursor-showMore-")) {
        nextCursor = content?.value || content?.itemContent?.value || nextCursor;
        continue;
      }

      const direct = extractBookmarkTweet(content?.itemContent?.tweet_results?.result, seen);
      if (direct) {
        tweets.push(direct);
        continue;
      }

      for (const item of content?.items || []) {
        const nested = extractBookmarkTweet(item.item?.itemContent?.tweet_results?.result, seen);
        if (nested) {
          tweets.push(nested);
        }
      }
    }
  }

  return { tweets, nextCursor };
}

async function fetchQueryIdFromPlaceholder() {
  const payload = await requestJson(
    "https://raw.githubusercontent.com/fa0311/twitter-openapi/refs/heads/main/src/config/placeholder.json",
    {},
    8_000,
  );
  return payload?.Bookmarks?.queryId || null;
}

export async function resolveBookmarksQueryId(explicitQueryId) {
  if (explicitQueryId) {
    return sanitizeQueryId(explicitQueryId);
  }

  try {
    const remoteQueryId = await fetchQueryIdFromPlaceholder();
    return sanitizeQueryId(remoteQueryId);
  } catch {
    return FALLBACK_BOOKMARKS_QUERY_ID;
  }
}

async function fetchBookmarksPage({ authToken, ct0, queryId, cursor, count }) {
  const url = buildBookmarksUrl(queryId, count, cursor);
  return await requestJson(url, {
    headers: {
      Authorization: `Bearer ${decodeURIComponent(BEARER_TOKEN)}`,
      Cookie: `auth_token=${authToken}; ct0=${ct0}`,
      Origin: "https://x.com",
      Referer: BOOKMARKS_URL,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "X-Csrf-Token": ct0,
      "X-Twitter-Active-User": "yes",
      "X-Twitter-Auth-Type": "OAuth2Session",
    },
  });
}

export async function collectBookmarksViaApi({ authToken, ct0, queryId, limit, maxPages, pageSize, pagePauseMs }) {
  const seen = new Set();
  const items = [];
  const rounds = [];
  let cursor = null;

  for (let page = 1; page <= maxPages; page += 1) {
    const remaining = limit > 0 ? Math.max(limit - items.length, 0) : pageSize;
    if (limit > 0 && remaining === 0) break;

    const requestCount = limit > 0 ? Math.min(pageSize, Math.max(remaining, 20)) : pageSize;
    const payload = await fetchBookmarksPage({
      authToken,
      ct0,
      queryId,
      cursor,
      count: requestCount,
    });

    const { tweets, nextCursor } = parseBookmarksResponse(payload, seen);
    items.push(...tweets);
    rounds.push({
      page,
      requested_count: requestCount,
      new_items: tweets.length,
      collected_total: items.length,
      cursor_in: cursor,
      cursor_out: nextCursor,
    });

    if (!nextCursor || nextCursor === cursor) break;
    if (limit > 0 && items.length >= limit) break;
    cursor = nextCursor;
    if (pagePauseMs > 0) {
      await sleep(pagePauseMs);
    }
  }

  return {
    queryId,
    items: limit > 0 ? items.slice(0, limit) : items,
    rounds,
  };
}
