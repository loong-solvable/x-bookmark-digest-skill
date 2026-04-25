(() => {
  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function normalizeStatusUrl(href) {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (!match) return null;
      return `${location.origin}/${match[1]}/status/${match[2]}`;
    } catch {
      return null;
    }
  }

  function extractStatusId(statusUrl) {
    const match = (statusUrl || "").match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  function isTopLevelArticle(article) {
    const parentArticle = article.parentElement
      ? article.parentElement.closest('article[data-testid="tweet"]')
      : null;
    return !parentArticle;
  }

  function pickStatusUrls(article) {
    return unique(
      [...article.querySelectorAll('a[href*="/status/"]')]
        .map((anchor) => normalizeStatusUrl(anchor.getAttribute("href") || anchor.href || ""))
        .filter(Boolean)
    );
  }

  function pickAuthorBlock(article) {
    return article.querySelector('div[data-testid="User-Name"]');
  }

  function pickAuthorName(article) {
    const block = pickAuthorBlock(article);
    if (!block) return "";
    const spans = [...block.querySelectorAll("span")].map((node) => cleanText(node.textContent));
    return spans.find((value) => value && !value.startsWith("@")) || "";
  }

  function pickHandle(article, statusUrl) {
    const match = (statusUrl || "").match(/^https?:\/\/[^/]+\/([^/]+)\/status\/\d+/);
    if (match) return `@${match[1]}`;
    const block = pickAuthorBlock(article);
    if (!block) return "";
    const spans = [...block.querySelectorAll("span")].map((node) => cleanText(node.textContent));
    return spans.find((value) => value.startsWith("@")) || "";
  }

  function pickTweetText(article) {
    const parts = [...article.querySelectorAll('div[data-testid="tweetText"]')]
      .map((node) => cleanText(node.innerText || node.textContent))
      .filter(Boolean);
    if (parts.length) return cleanText(parts.join("\n"));
    return "";
  }

  function pickExternalUrls(article) {
    const statusUrls = new Set(pickStatusUrls(article));
    return unique(
      [...article.querySelectorAll("a[href]")]
        .map((anchor) => anchor.getAttribute("href") || anchor.href || "")
        .map((href) => {
          try {
            return new URL(href, location.origin).toString();
          } catch {
            return "";
          }
        })
        .filter((href) => {
          if (!href) return false;
          if (statusUrls.has(normalizeStatusUrl(href))) return false;
          if (href.startsWith("https://x.com/") || href.startsWith("https://twitter.com/")) {
            return !/\/status\/\d+/.test(href);
          }
          return true;
        })
    );
  }

  function pickMedia(article) {
    const images = [...article.querySelectorAll('img[src]')]
      .map((img) => img.getAttribute("src") || "")
      .filter((src) => /twimg\.com\/media|pbs\.twimg\.com/.test(src));
    const videos = [...article.querySelectorAll("video, source[src]")]
      .map((node) => node.getAttribute("poster") || node.getAttribute("src") || "")
      .filter(Boolean);
    return unique([...images, ...videos]);
  }

  function pickMetrics(article) {
    const names = ["reply", "retweet", "like", "bookmark"];
    const metrics = {};
    for (const name of names) {
      const node = article.querySelector(`[data-testid="${name}"]`);
      if (!node) continue;
      metrics[name] = cleanText(node.innerText || node.textContent || node.getAttribute("aria-label") || "");
    }
    return metrics;
  }

  function pickQuotedStatusUrls(article) {
    const quotedArticles = [...article.querySelectorAll('article[data-testid="tweet"]')].filter((node) => node !== article);
    return unique(quotedArticles.flatMap((node) => pickStatusUrls(node)));
  }

  function pickHashtags(text) {
    return unique((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((value) => value.trim()));
  }

  const items = [];
  const seen = new Set();
  const articles = [...document.querySelectorAll('article[data-testid="tweet"]')].filter(isTopLevelArticle);

  for (const article of articles) {
    const statusUrls = pickStatusUrls(article);
    const statusUrl = statusUrls[0] || null;
    const statusId = extractStatusId(statusUrl);
    const text = pickTweetText(article);
    const fingerprint = statusId || `${pickAuthorName(article)}|${text}`.slice(0, 240);
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const item = {
      bookmark_id: statusId || fingerprint,
      status_id: statusId,
      status_url: statusUrl,
      status_urls: statusUrls,
      author_name: pickAuthorName(article),
      handle: pickHandle(article, statusUrl),
      text,
      hashtags: pickHashtags(text),
      urls: pickExternalUrls(article),
      media: pickMedia(article),
      metrics: pickMetrics(article),
      quoted_status_urls: pickQuotedStatusUrls(article),
      is_reply: /replying to/i.test(article.innerText || ""),
      raw_text_fallback: cleanText(article.innerText || article.textContent || "")
    };

    items.push(item);
  }

  return {
    captured_at: new Date().toISOString(),
    page_url: location.href,
    page_title: document.title,
    scroll_y: window.scrollY,
    page_height: document.documentElement.scrollHeight,
    viewport_height: window.innerHeight,
    item_count: items.length,
    items
  };
})()

