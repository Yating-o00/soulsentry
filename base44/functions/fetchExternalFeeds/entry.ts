// 外部数据源拉取后端函数
// 支持直接调用 { feed_id } 或定时自动化扫描全部活跃 ExternalFeed
// 将新条目作为心签 (Note) 沉淀到用户知识库
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function parseRssItems(xml, limit = 5) {
  const items = [];
  // 同时兼容 <item> (RSS) 和 <entry> (Atom)
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks.slice(0, limit)) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1]
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
    };
    const linkM = block.match(/<link[^>]*?href=["']([^"']+)["']/i);
    items.push({
      title: get('title'),
      link: linkM?.[1] || get('link'),
      pubDate: get('pubDate') || get('published') || get('updated'),
      description: (get('description') || get('summary') || get('content')).slice(0, 500),
    });
  }
  return items;
}

async function fetchOneFeed(base44, feed) {
  if (!feed.url) return { feed_id: feed.id, fetched: 0, error: 'no url' };
  try {
    const resp = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 SoulSentry/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return { feed_id: feed.id, fetched: 0, error: `HTTP ${resp.status}` };
    const xml = await resp.text();
    const items = parseRssItems(xml, 5);

    let created = 0;
    if (feed.auto_archive_to_heartsign !== false) {
      for (const item of items) {
        if (!item.link) continue;
        // 去重：用 source_url 查询
        const exists = await base44.asServiceRole.entities.Note.filter({
          source_url: item.link,
        }, '-created_date', 1);
        if (exists?.length) continue;

        const plain = `${item.title}\n\n${item.description}`.trim();
        await base44.asServiceRole.entities.Note.create({
          content: `<div><strong>${item.title || '外部条目'}</strong></div><div>${item.description || ''}</div><div><a href="${item.link}">${item.link}</a></div>`,
          plain_text: plain,
          source_type: 'external_feed',
          source_url: item.link,
          tags: [feed.name, feed.feed_type].filter(Boolean),
          ai_status: 'pending',
          color: 'white',
        });
        created++;
      }
    }

    await base44.asServiceRole.entities.ExternalFeed.update(feed.id, {
      last_fetched_at: new Date().toISOString(),
      last_item_count: items.length,
    });
    return { feed_id: feed.id, fetched: items.length, archived: created };
  } catch (e) {
    return { feed_id: feed.id, fetched: 0, error: e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // 单源手动拉取
    if (body.feed_id) {
      const feeds = await base44.asServiceRole.entities.ExternalFeed.filter({ id: body.feed_id }, '-created_date', 1);
      const feed = feeds?.[0];
      if (!feed) return Response.json({ error: 'Feed not found' }, { status: 404 });
      const result = await fetchOneFeed(base44, feed);
      return Response.json(result);
    }

    // 定时批量扫描（仅管理员或自动化触发可调）
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      // 来自自动化时无 user，允许 service role 模式继续
    } else if (user.role !== 'admin' && !body.allow_user) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allActive = await base44.asServiceRole.entities.ExternalFeed.filter({ is_active: true }, '-created_date', 100);
    const results = [];
    for (const feed of allActive) {
      const last = feed.last_fetched_at ? new Date(feed.last_fetched_at).getTime() : 0;
      const freq = (feed.fetch_frequency_hours || 24) * 3600 * 1000;
      if (Date.now() - last < freq) continue;
      const r = await fetchOneFeed(base44, feed);
      results.push(r);
    }
    return Response.json({ scanned: allActive.length, processed: results.length, results });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});