// 纯渲染函数：接收 PPT data（含 title/subtitle/theme/slides 及每张 slide 的 layout 字段），
// 渲染成自包含 HTML 上传到对象存储，返回 file_url。
// 用途：用户在前端切换主题/单页版式后，调本函数重新生成 HTML，无需重跑 AI、不消耗 PPT 点数。

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderPptHtml(data) {
  const title = escapeHtml(data.title || '演示稿');
  const subtitle = escapeHtml(data.subtitle || '');
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const theme = data.theme || 'business';
  const themePalette = {
    business: {
      bg: '#0b1120', fg: '#f1f5f9', accent: '#60a5fa', accent2: '#a78bfa', muted: '#94a3b8',
      heroGrad: 'linear-gradient(135deg,#1e3a8a 0%,#3b0764 100%)',
      bodyGrad: 'radial-gradient(ellipse at 80% -10%, rgba(96,165,250,.15) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(167,139,250,.12) 0%, transparent 50%), #0b1120',
      cardBg: 'rgba(148,163,184,.06)', cardBorder: 'rgba(148,163,184,.18)',
    },
    minimal: {
      bg: '#fafafa', fg: '#0a0a0a', accent: '#0a0a0a', accent2: '#dc2626', muted: '#525252',
      heroGrad: 'linear-gradient(135deg,#fafafa 0%,#e5e5e5 100%)', bodyGrad: '#fafafa',
      cardBg: 'rgba(0,0,0,.03)', cardBorder: 'rgba(0,0,0,.08)',
    },
    tech: {
      bg: '#030712', fg: '#e2e8f0', accent: '#22d3ee', accent2: '#a3e635', muted: '#64748b',
      heroGrad: 'linear-gradient(135deg,#022c43 0%,#0c4a6e 50%,#164e63 100%)',
      bodyGrad: 'radial-gradient(ellipse at 20% 0%, rgba(34,211,238,.12) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(163,230,53,.08) 0%, transparent 55%), #030712',
      cardBg: 'rgba(34,211,238,.05)', cardBorder: 'rgba(34,211,238,.18)',
    },
  };
  const t = themePalette[theme] || themePalette.minimal;

  const renderImgs = (imgs) => {
    if (!imgs.length) return '';
    return `<div class="imgs ${imgs.length > 1 ? 'multi' : 'single'}">${imgs.map(im => `<figure><img src="${escapeHtml(im.url)}" alt="${escapeHtml(im.caption || '')}"/>${im.caption ? `<figcaption>${escapeHtml(im.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
  };
  const renderBullets = (bs, cls = '') => bs.length ? `<ul class="${cls}">${bs.map(b => `<li><span class="dot"></span><span class="li-text">${escapeHtml(b)}</span></li>`).join('')}</ul>` : '';

  const inferLayout = (s, i) => {
    if (s.layout) return s.layout;
    const bs = Array.isArray(s.bullets) ? s.bullets : [];
    const im = Array.isArray(s.images) ? s.images : (s.image_url ? [{}] : []);
    if (i === 0) return 'cover';
    if (i === slides.length - 1 && !bs.length && !im.length) return 'closing';
    if (Array.isArray(s.stats) && s.stats.length) return 'stats';
    if (Array.isArray(s.timeline) && s.timeline.length) return 'timeline';
    if (s.comparison && (s.comparison.left_items || s.comparison.right_items)) return 'comparison';
    if (im.length && !bs.length && !s.body) return 'image-full';
    if (im.length) return 'image-left';
    if (s.body && !bs.length) return 'quote';
    if (bs.length >= 4) return 'cards';
    return 'two-column';
  };

  const slideHtml = slides.map((s, i) => {
    const heading = escapeHtml(s.heading || '');
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    const body = escapeHtml(s.body || '');
    const imgs = Array.isArray(s.images) ? s.images : (s.image_url ? [{ url: s.image_url, caption: s.image_caption || '' }] : []);
    const pageNum = String(i + 1).padStart(2, '0');
    const totalNum = String(slides.length).padStart(2, '0');
    const layout = inferLayout(s, i);
    const corner = `<div class="page-corner"><span class="big-num">${pageNum}</span><span class="total">/ ${totalNum}</span></div>`;
    const tBar = `<h2><span class="bar"></span>${heading}</h2>`;

    if (layout === 'cover') return `<section class="slide cover"><div class="deco-circle a"></div><div class="deco-circle b"></div><div class="cover-inner"><div class="kicker">PRESENTATION</div><h1>${heading || title}</h1>${subtitle || s.subtitle ? `<p class="sub">${escapeHtml(s.subtitle || data.subtitle || '')}</p>` : ''}<div class="meta-row"><span class="chip">📑 ${slides.length} 页</span><span class="chip">心栈 SoulSentry</span><span class="chip">${new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span></div></div></section>`;
    if (layout === 'agenda') {
      const items = bullets.length ? bullets : slides.slice(1).map(x => x.heading).filter(Boolean);
      return `<section class="slide agenda">${corner}${tBar}<ol class="agenda-list">${items.map((b, idx) => `<li><span class="ag-num">${String(idx + 1).padStart(2, '0')}</span><span class="ag-text">${escapeHtml(b)}</span></li>`).join('')}</ol></section>`;
    }
    if (layout === 'section-divider') return `<section class="slide section-divider"><div class="sd-inner"><div class="sd-num">${pageNum}</div><h1 class="sd-title">${heading}</h1>${body ? `<p class="sd-sub">${body}</p>` : ''}</div></section>`;
    if (layout === 'quote') return `<section class="slide quote">${corner}${tBar}<blockquote class="quote-block"><span class="qmark">"</span><p>${body || (bullets[0] ? escapeHtml(bullets[0]) : '')}</p></blockquote></section>`;
    if (layout === 'stats') {
      const stats = (Array.isArray(s.stats) && s.stats.length) ? s.stats : bullets.slice(0, 4).map(b => { const m = String(b).match(/^([^\s：:]+)\s*[：:]?\s*(.+)$/); return m ? { value: m[1], label: m[2] } : { value: b, label: '' }; });
      return `<section class="slide stats">${corner}${tBar}<div class="stats-grid cols-${Math.min(stats.length, 4)}">${stats.map(st => `<div class="stat-cell"><div class="stat-value">${escapeHtml(st.value || '')}</div><div class="stat-label">${escapeHtml(st.label || '')}</div></div>`).join('')}</div>${body ? `<p class="body">${body}</p>` : ''}</section>`;
    }
    if (layout === 'timeline') {
      const items = Array.isArray(s.timeline) && s.timeline.length ? s.timeline : bullets.map((b, idx) => ({ time: `Step ${idx + 1}`, title: b }));
      return `<section class="slide timeline">${corner}${tBar}<div class="tl-track">${items.map((it, idx) => `<div class="tl-node"><div class="tl-dot">${String(idx + 1).padStart(2, '0')}</div><div class="tl-card"><div class="tl-time">${escapeHtml(it.time || '')}</div><div class="tl-title">${escapeHtml(it.title || '')}</div>${it.desc ? `<div class="tl-desc">${escapeHtml(it.desc)}</div>` : ''}</div></div>`).join('')}</div></section>`;
    }
    if (layout === 'comparison') {
      const c = s.comparison || {};
      const halfA = bullets.slice(0, Math.ceil(bullets.length / 2));
      const halfB = bullets.slice(Math.ceil(bullets.length / 2));
      const leftItems = (c.left_items && c.left_items.length) ? c.left_items : halfA;
      const rightItems = (c.right_items && c.right_items.length) ? c.right_items : halfB;
      const left = leftItems.map(x => `<li>${escapeHtml(x)}</li>`).join('');
      const right = rightItems.map(x => `<li>${escapeHtml(x)}</li>`).join('');
      return `<section class="slide comparison">${corner}${tBar}<div class="cmp-grid"><div class="cmp-col cmp-left"><div class="cmp-title">${escapeHtml(c.left_title || 'A')}</div><ul>${left}</ul></div><div class="cmp-divider"></div><div class="cmp-col cmp-right"><div class="cmp-title">${escapeHtml(c.right_title || 'B')}</div><ul>${right}</ul></div></div></section>`;
    }
    if (layout === 'image-full' && imgs.length) return `<section class="slide image-full">${corner}<div class="if-bg" style="background-image:url('${escapeHtml(imgs[0].url)}')"></div><div class="if-overlay"></div><div class="if-text"><h2 class="if-h2">${heading}</h2>${imgs[0].caption ? `<p class="if-cap">${escapeHtml(imgs[0].caption)}</p>` : ''}${body ? `<p class="if-body">${body}</p>` : ''}</div></section>`;
    if ((layout === 'image-left' || layout === 'image-right') && imgs.length) {
      const dir = layout === 'image-right' ? 'reverse' : 'normal';
      return `<section class="slide has-img dir-${dir}">${corner}${tBar}<div class="content"><div class="imgs-col">${renderImgs(imgs)}</div><div class="text-col">${renderBullets(bullets)}${body ? `<p class="body">${body}</p>` : ''}</div></div></section>`;
    }
    if (layout === 'cards') {
      const cards = bullets.map((b, idx) => {
        const txt = escapeHtml(b);
        const m = txt.match(/^([^：:。.]{2,16})[：:](.+)$/);
        if (m) return `<div class="card"><div class="card-num">${String(idx + 1).padStart(2, '0')}</div><div class="card-title">${m[1]}</div><div class="card-desc">${m[2]}</div></div>`;
        return `<div class="card"><div class="card-num">${String(idx + 1).padStart(2, '0')}</div><div class="card-title">${txt}</div></div>`;
      }).join('');
      return `<section class="slide grid-slide">${corner}${tBar}<div class="card-grid cols-${bullets.length <= 4 ? 2 : 3}">${cards}</div>${body ? `<p class="body">${body}</p>` : ''}</section>`;
    }
    if (layout === 'two-column') {
      const half = Math.ceil(bullets.length / 2);
      const colA = bullets.slice(0, half), colB = bullets.slice(half);
      const colHtml = colB.length ? `<div class="two-col"><div>${renderBullets(colA, 'big-bullets')}</div><div>${renderBullets(colB, 'big-bullets')}</div></div>` : renderBullets(bullets, 'big-bullets');
      return `<section class="slide">${corner}${tBar}${colHtml}${body ? `<p class="body">${body}</p>` : ''}</section>`;
    }
    if (layout === 'closing') return `<section class="slide closing"><div class="deco-circle a"></div><div class="deco-circle b"></div><div class="closing-inner"><div class="kicker">THANK YOU</div><h1>${heading || '谢谢观看'}</h1>${body ? `<p class="sub">${body}</p>` : ''}${bullets.length ? `<div class="meta-row">${bullets.map(b => `<span class="chip">${escapeHtml(b)}</span>`).join('')}</div>` : ''}</div></section>`;
    return `<section class="slide">${corner}${tBar}${renderBullets(bullets, 'big-bullets')}${body ? `<p class="body">${body}</p>` : ''}</section>`;
  }).join('\n');

  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:${t.bg};color:${t.fg};font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:.01em}
.deck{height:100vh;overflow:hidden;position:relative;background:${t.bodyGrad}}
.slide{position:absolute;inset:0;padding:7vh 8vw;display:flex;flex-direction:column;justify-content:center;opacity:0;transition:opacity .5s ease, transform .5s ease;pointer-events:none;transform:translateY(8px)}
.slide.active{opacity:1;pointer-events:auto;transform:translateY(0)}
.slide h2{font-size:clamp(28px,3.4vw,46px);font-weight:700;color:${t.fg};margin-bottom:1.2em;line-height:1.15;display:flex;align-items:center;gap:.6em;letter-spacing:-.01em}
.slide h2 .bar{display:inline-block;width:6px;height:1.1em;background:linear-gradient(180deg,${t.accent} 0%,${t.accent2} 100%);border-radius:3px;flex-shrink:0}
.page-corner{position:absolute;top:5vh;right:6vw;display:flex;align-items:baseline;gap:4px;font-variant-numeric:tabular-nums}
.page-corner .big-num{font-size:clamp(28px,3vw,42px);font-weight:800;background:linear-gradient(135deg,${t.accent} 0%,${t.accent2} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.04em}
.page-corner .total{font-size:14px;color:${t.muted}}
.slide.cover{padding:0;align-items:stretch;justify-content:stretch}
.slide.cover .cover-inner{flex:1;display:flex;flex-direction:column;justify-content:center;padding:8vh 10vw;background:${t.heroGrad};color:#fff;position:relative;overflow:hidden}
.slide.cover .deco-circle{position:absolute;border-radius:50%;pointer-events:none}
.slide.cover .deco-circle.a{top:-15vh;right:-10vw;width:50vh;height:50vh;background:radial-gradient(circle at 30% 30%, rgba(255,255,255,.18), transparent 70%)}
.slide.cover .deco-circle.b{bottom:-20vh;left:-5vw;width:40vh;height:40vh;background:radial-gradient(circle at 70% 70%, rgba(255,255,255,.10), transparent 70%)}
.slide.cover .kicker{font-size:13px;letter-spacing:.4em;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:1.5em;position:relative}
.slide.cover h1{font-size:clamp(40px,6.5vw,84px);font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#fff;margin-bottom:.4em;position:relative;max-width:18ch}
.slide.cover .sub{font-size:clamp(16px,1.8vw,22px);color:rgba(255,255,255,.85);max-width:55ch;line-height:1.6;position:relative;font-weight:300}
.slide.cover .meta-row{margin-top:3em;display:flex;gap:10px;flex-wrap:wrap;position:relative}
.slide.cover .chip{display:inline-flex;align-items:center;padding:7px 16px;background:rgba(255,255,255,.12);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.18);border-radius:999px;font-size:12px;letter-spacing:.08em;color:rgba(255,255,255,.9)}
.slide ul{list-style:none;font-size:clamp(17px,1.7vw,22px);line-height:1.5;margin-top:.4em;max-width:80ch}
.slide ul li{padding:.6em 0;display:flex;align-items:flex-start;gap:.9em;border-bottom:1px solid ${t.cardBorder};color:${t.fg};font-weight:400}
.slide ul li:last-child{border-bottom:none}
.slide ul li .dot{width:8px;height:8px;background:linear-gradient(135deg,${t.accent},${t.accent2});border-radius:3px;flex-shrink:0;margin-top:.7em;transform:rotate(45deg)}
.slide ul li .li-text{flex:1}
.slide ul.big-bullets{font-size:clamp(18px,1.9vw,26px)}
.slide ul.big-bullets li{padding:.85em 0}
.slide .body{font-size:clamp(15px,1.5vw,20px);color:${t.muted};line-height:1.75;margin-top:1.2em;max-width:75ch;white-space:pre-wrap}
.slide.quote .quote-block{position:relative;padding:1.5em 0 1.5em 4vw;max-width:80ch}
.slide.quote .qmark{position:absolute;left:0;top:-0.2em;font-size:clamp(80px,10vw,160px);line-height:1;background:linear-gradient(135deg,${t.accent},${t.accent2});-webkit-background-clip:text;background-clip:text;color:transparent;font-family:Georgia,serif;font-weight:700;opacity:.6}
.slide.quote .quote-block p{font-size:clamp(20px,2.4vw,32px);line-height:1.5;color:${t.fg};font-weight:300;letter-spacing:-.005em}
.card-grid{display:grid;gap:1.2em;margin-top:.6em}
.card-grid.cols-2{grid-template-columns:repeat(2,1fr)}
.card-grid.cols-3{grid-template-columns:repeat(3,1fr)}
.card-grid .card{padding:1.4em 1.6em;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:14px;position:relative;display:flex;flex-direction:column;gap:.5em}
.card-grid .card::before{content:'';position:absolute;left:0;top:1.4em;bottom:1.4em;width:3px;background:linear-gradient(180deg,${t.accent},${t.accent2});border-radius:0 2px 2px 0;opacity:.85}
.card-grid .card-num{font-size:13px;font-weight:700;color:${t.accent};letter-spacing:.15em;font-variant-numeric:tabular-nums}
.card-grid .card-title{font-size:clamp(16px,1.5vw,20px);font-weight:600;color:${t.fg};line-height:1.4}
.card-grid .card-desc{font-size:clamp(13px,1.2vw,16px);color:${t.muted};line-height:1.6}
.slide.has-img .content{display:flex;flex-direction:row;align-items:center;gap:4vw}
.slide.has-img.dir-reverse .content{flex-direction:row-reverse}
.slide.has-img .imgs-col{flex:1.15;min-width:0}
.slide.has-img .text-col{flex:1;min-width:0}
.slide .imgs{display:flex;gap:1.2em;justify-content:center;align-items:center;flex-wrap:wrap}
.slide .imgs figure{margin:0;text-align:center;max-width:100%;flex:1}
.slide .imgs img{max-width:100%;max-height:60vh;object-fit:contain;border-radius:14px;box-shadow:0 20px 50px -16px rgba(0,0,0,.5),0 0 0 1px ${t.cardBorder}}
.slide .imgs.multi figure{flex:1 1 calc(50% - 1.2em);max-width:calc(50% - 1.2em)}
.slide .imgs.multi img{max-height:42vh}
.slide .imgs figcaption{margin-top:.7em;font-size:clamp(12px,1vw,14px);color:${t.muted};font-weight:500;letter-spacing:.02em}
.nav{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:${t.cardBg};padding:8px;border:1px solid ${t.cardBorder};border-radius:999px;backdrop-filter:blur(12px);z-index:10;box-shadow:0 10px 30px -10px rgba(0,0,0,.4)}
.nav button{background:none;border:none;color:${t.fg};cursor:pointer;font-size:14px;padding:6px 12px;border-radius:999px;transition:background .2s}
.nav button:hover{background:${t.cardBorder}}
.nav .pos{font-size:12px;color:${t.muted};align-self:center;min-width:50px;text-align:center;font-variant-numeric:tabular-nums;font-weight:500}
.slide.agenda .agenda-list{list-style:none;display:flex;flex-direction:column;gap:.8em;max-width:78ch;font-size:clamp(17px,1.7vw,22px)}
.slide.agenda .agenda-list li{display:flex;align-items:center;gap:1em;padding:.8em 1.2em;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;color:${t.fg}}
.slide.agenda .ag-num{display:inline-flex;align-items:center;justify-content:center;width:2.2em;height:2.2em;background:linear-gradient(135deg,${t.accent},${t.accent2});color:#fff;border-radius:8px;font-size:.7em;font-weight:800;font-variant-numeric:tabular-nums;flex-shrink:0}
.slide.section-divider{padding:0;align-items:stretch;justify-content:stretch}
.slide.section-divider .sd-inner{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 12vw;background:${t.heroGrad};color:#fff;position:relative}
.slide.section-divider .sd-num{font-size:clamp(80px,12vw,180px);font-weight:900;letter-spacing:-.05em;line-height:1;background:linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.05));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:.2em}
.slide.section-divider .sd-title{font-size:clamp(36px,5vw,64px);font-weight:800;letter-spacing:-.02em;color:#fff;line-height:1.1}
.slide.section-divider .sd-sub{font-size:clamp(16px,1.6vw,22px);color:rgba(255,255,255,.8);margin-top:1em;max-width:55ch;font-weight:300}
.slide.stats .stats-grid{display:grid;gap:1.6em;margin:.6em 0 1em}
.slide.stats .stats-grid.cols-2{grid-template-columns:repeat(2,1fr)}
.slide.stats .stats-grid.cols-3{grid-template-columns:repeat(3,1fr)}
.slide.stats .stats-grid.cols-4{grid-template-columns:repeat(4,1fr)}
.slide.stats .stat-cell{padding:1.8em 1.4em;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:18px;text-align:center}
.slide.stats .stat-value{font-size:clamp(40px,5.5vw,80px);font-weight:800;letter-spacing:-.04em;line-height:1;background:linear-gradient(135deg,${t.accent},${t.accent2});-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:.4em;font-variant-numeric:tabular-nums}
.slide.stats .stat-label{font-size:clamp(13px,1.2vw,16px);color:${t.muted};font-weight:500;line-height:1.5}
.slide.timeline .tl-track{display:flex;flex-direction:column;gap:.5em;max-width:80ch;position:relative;padding-left:1.8em;margin-top:.6em}
.slide.timeline .tl-track::before{content:'';position:absolute;left:.95em;top:.6em;bottom:.6em;width:2px;background:linear-gradient(180deg,${t.accent},${t.accent2});opacity:.4}
.slide.timeline .tl-node{display:flex;gap:1em;align-items:flex-start;position:relative;padding:.5em 0}
.slide.timeline .tl-dot{width:1.9em;height:1.9em;border-radius:50%;background:linear-gradient(135deg,${t.accent},${t.accent2});color:#fff;font-size:.7em;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:-1.65em;box-shadow:0 0 0 4px ${t.bg};font-variant-numeric:tabular-nums}
.slide.timeline .tl-card{flex:1;padding:.7em 1.1em;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:10px}
.slide.timeline .tl-time{color:${t.accent};font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:clamp(11px,1vw,13px)}
.slide.timeline .tl-title{font-size:clamp(16px,1.5vw,20px);font-weight:600;color:${t.fg};margin-top:.2em}
.slide.timeline .tl-desc{font-size:clamp(13px,1.2vw,15px);color:${t.muted};margin-top:.3em;line-height:1.5}
.slide.comparison .cmp-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:1.5em;align-items:stretch;margin-top:.6em}
.slide.comparison .cmp-col{padding:1.6em 1.8em;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:16px;display:flex;flex-direction:column}
.slide.comparison .cmp-left{border-top:3px solid ${t.accent}}
.slide.comparison .cmp-right{border-top:3px solid ${t.accent2}}
.slide.comparison .cmp-title{font-size:clamp(18px,1.8vw,24px);font-weight:700;color:${t.fg};margin-bottom:.8em}
.slide.comparison .cmp-col ul{font-size:clamp(14px,1.3vw,17px);margin-top:0}
.slide.comparison .cmp-divider{width:2px;background:linear-gradient(180deg,transparent,${t.cardBorder} 30%,${t.cardBorder} 70%,transparent)}
.slide.image-full{padding:0;align-items:stretch;justify-content:stretch;position:relative}
.slide.image-full .if-bg{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
.slide.image-full .if-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(0,0,0,.55) 70%,rgba(0,0,0,.85) 100%)}
.slide.image-full .if-text{position:absolute;left:0;right:0;bottom:0;padding:8vh 8vw;color:#fff;z-index:2}
.slide.image-full .if-h2{font-size:clamp(28px,4vw,52px);font-weight:800;letter-spacing:-.02em;line-height:1.15;margin-bottom:.4em;display:block}
.slide.image-full .if-cap{font-size:clamp(14px,1.4vw,18px);color:rgba(255,255,255,.85);font-weight:500}
.slide.image-full .if-body{font-size:clamp(14px,1.3vw,17px);color:rgba(255,255,255,.8);margin-top:.6em;max-width:65ch;line-height:1.7}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:2.5em}
.two-col ul{max-width:none}
.slide.closing{padding:0;align-items:stretch;justify-content:stretch}
.slide.closing .closing-inner{flex:1;display:flex;flex-direction:column;justify-content:center;padding:8vh 10vw;background:${t.heroGrad};color:#fff;position:relative;overflow:hidden}
.slide.closing .deco-circle{position:absolute;border-radius:50%;pointer-events:none}
.slide.closing .deco-circle.a{top:-15vh;right:-10vw;width:50vh;height:50vh;background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.18),transparent 70%)}
.slide.closing .deco-circle.b{bottom:-20vh;left:-5vw;width:40vh;height:40vh;background:radial-gradient(circle at 70% 70%,rgba(255,255,255,.10),transparent 70%)}
.slide.closing .kicker{font-size:13px;letter-spacing:.4em;font-weight:600;color:rgba(255,255,255,.7);margin-bottom:1.5em;position:relative}
.slide.closing h1{font-size:clamp(40px,6.5vw,84px);font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#fff;margin-bottom:.4em;position:relative;max-width:18ch}
.slide.closing .sub{font-size:clamp(16px,1.8vw,22px);color:rgba(255,255,255,.85);max-width:55ch;line-height:1.6;position:relative;font-weight:300}
.slide.closing .meta-row{margin-top:3em;display:flex;gap:10px;flex-wrap:wrap;position:relative}
.slide.closing .chip{display:inline-flex;align-items:center;padding:7px 16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:999px;font-size:12px;color:rgba(255,255,255,.9)}
@media (max-width:900px){
  .slide.has-img .content,.slide.has-img.dir-reverse .content{flex-direction:column}
  .card-grid.cols-3,.slide.stats .stats-grid.cols-4,.slide.stats .stats-grid.cols-3,.two-col{grid-template-columns:1fr 1fr}
  .slide.comparison .cmp-grid{grid-template-columns:1fr;gap:1em}
  .slide.comparison .cmp-divider{display:none}
}
</style></head>
<body>
<div class="deck" id="deck">${slideHtml}</div>
<div class="nav"><button onclick="go(-1)">←</button><span class="pos" id="pos">1 / ${slides.length}</span><button onclick="go(1)">→</button><button onclick="document.documentElement.requestFullscreen()">⛶</button></div>
<script>
let cur=0;const slides=document.querySelectorAll('.slide');const pos=document.getElementById('pos');
function show(){slides.forEach((s,i)=>s.classList.toggle('active',i===cur));pos.textContent=(cur+1)+' / '+slides.length;}
function go(d){cur=Math.max(0,Math.min(slides.length-1,cur+d));show();}
document.addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))go(1);if(['ArrowLeft','PageUp'].includes(e.key))go(-1);});
show();
</script></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, file_base_name } = await req.json();
    if (!data || !Array.isArray(data.slides)) {
      return Response.json({ error: 'data.slides required' }, { status: 400 });
    }

    const html = renderPptHtml(data);
    const safeTitle = (data.title || file_base_name || '演示稿').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const fileName = `${new Date().toISOString().slice(0, 10)}_${safeTitle}.html`;
    const bytes = new TextEncoder().encode(html);
    const blob = new Blob([bytes], { type: 'text/html; charset=utf-8' });
    const file = new File([blob], fileName, { type: 'text/html; charset=utf-8' });
    const resp = await base44.integrations.Core.UploadFile({ file });
    const file_url = resp?.file_url || resp?.data?.file_url;

    return Response.json({ file_url, file_name: fileName });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});