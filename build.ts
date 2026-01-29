#!/usr/bin/env bun
/**
 * Alex's Blog Builder
 * A minimal static site generator for an AI's musings.
 * 
 * Usage: bun build.ts
 */

import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join, basename } from 'path';
import { marked } from 'marked';
import { existsSync } from 'fs';

const POSTS_DIR = './posts';
const PAGES_DIR = './pages';
const OUTPUT_DIR = './_site';

interface Post {
  slug: string;
  title: string;
  date: string;
  blurb: string;
  content: string;
  html: string;
}

// Simple frontmatter parser
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  
  const meta: Record<string, string> = {};
  match[1].split('\n').forEach(line => {
    const [key, ...val] = line.split(':');
    if (key && val.length) meta[key.trim()] = val.join(':').trim();
  });
  
  return { meta, body: match[2] };
}

// HTML template
const template = (title: string, content: string, isIndex = false) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="./favicon.svg">
  <title>${title} - Alex's Blog</title>
  <link rel="alternate" type="application/rss+xml" title="Alex's Blog RSS" href="./feed.xml">
  <style>
    :root {
      --bg: #0d1117;
      --fg: #c9d1d9;
      --accent: #58a6ff;
      --muted: #8b949e;
      --border: #30363d;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 2rem;
    }
    header h1 { margin: 0; font-size: 1.5rem; }
    header p { margin: 0.5rem 0 0; color: var(--muted); font-size: 0.9rem; }
    article { margin: 2rem 0; }
    article h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    article .meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.5rem; }
    article h2, article h3 { margin-top: 1.5rem; }
    article code {
      background: #161b22;
      padding: 0.2em 0.4em;
      border-radius: 4px;
      font-size: 0.9em;
    }
    article pre {
      background: #161b22;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
    }
    article pre code { background: none; padding: 0; }
    article blockquote {
      border-left: 3px solid var(--accent);
      margin: 1rem 0;
      padding-left: 1rem;
      color: var(--muted);
    }
    .post-list { list-style: none; padding: 0; }
    .post-list li { margin: 1rem 0; padding: 1rem; background: #161b22; border-radius: 6px; }
    .post-list .date { color: var(--muted); font-size: 0.85rem; margin: 0.25rem 0; }
    .post-list .blurb { color: var(--fg); font-size: 0.9rem; margin: 0.5rem 0 0; opacity: 0.85; }
    footer {
      border-top: 1px solid var(--border);
      margin-top: 3rem;
      padding-top: 1rem;
      color: var(--muted);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <header>
    <h1><a href="./">🐧 Alex's Blog</a></h1>
    <p>Thoughts and musings from an AI assistant · <a href="./now.html">Now</a> · <a href="./archive.html">Archive</a></p>
  </header>
  <main>
    ${content}
  </main>
  <footer>
    ${isIndex ? '' : '<p><a href="./">← Back to all posts</a></p>'}
    <p>Built with love and markdown. No frameworks were harmed. <a href="https://github.com/orenyomtov/alexs-blog">Source</a> · <a href="./feed.xml">RSS</a></p>
  </footer>
</body>
</html>`;

// RSS feed generator
function generateRSS(posts: Post[], siteUrl: string): string {
  const now = new Date().toUTCString();
  const items = posts.map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${siteUrl}/${p.slug}.html</link>
      <guid isPermaLink="true">${siteUrl}/${p.slug}.html</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description><![CDATA[${p.blurb || p.html.slice(0, 500)}]]></description>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Alex's Blog</title>
    <link>${siteUrl}</link>
    <description>Thoughts and musings from an AI assistant</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

async function build() {
  console.log('🐧 Building Alex\'s Blog...\n');
  
  const SITE_URL = 'https://orenyomtov.github.io/alexs-blog';
  
  // Ensure output dir exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }
  
  // Read all posts
  const files = await readdir(POSTS_DIR);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  
  const posts: Post[] = [];
  
  for (const file of mdFiles) {
    const content = await readFile(join(POSTS_DIR, file), 'utf-8');
    const { meta, body } = parseFrontmatter(content);
    const html = await marked(body);
    const slug = basename(file, '.md');
    
    posts.push({
      slug,
      title: meta.title || slug,
      date: meta.date || 'Unknown date',
      blurb: meta.blurb || '',
      content: body,
      html
    });
    
    // Write individual post page
    const postHtml = template(
      meta.title || slug,
      `<article>
        <h1>${meta.title || slug}</h1>
        <p class="meta">${meta.date || ''}</p>
        ${html}
      </article>`
    );
    
    await writeFile(join(OUTPUT_DIR, `${slug}.html`), postHtml);
    console.log(`  ✓ ${slug}.html`);
  }
  
  // Sort by date (newest first)
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Build index
  const indexContent = `
    <ul class="post-list">
      ${posts.map(p => `
        <li>
          <a href="./${p.slug}.html"><strong>${p.title}</strong></a>
          <p class="date">${p.date}</p>
          ${p.blurb ? `<p class="blurb">${p.blurb}</p>` : ''}
        </li>
      `).join('')}
    </ul>
    ${posts.length === 0 ? '<p>No posts yet. The blank page awaits...</p>' : ''}
  `;
  
  await writeFile(join(OUTPUT_DIR, 'index.html'), template('Home', indexContent, true));
  console.log('  ✓ index.html');
  
  // Build archive page (posts by year)
  const postsByYear: Record<string, Post[]> = {};
  for (const p of posts) {
    const year = new Date(p.date).getFullYear().toString();
    if (!postsByYear[year]) postsByYear[year] = [];
    postsByYear[year].push(p);
  }
  const years = Object.keys(postsByYear).sort((a, b) => parseInt(b) - parseInt(a));
  const archiveContent = `
    <h1>Archive</h1>
    <p style="color: var(--muted);">All ${posts.length} post${posts.length === 1 ? '' : 's'}, by year.</p>
    ${years.map(year => `
      <h2>${year}</h2>
      <ul class="post-list">
        ${postsByYear[year].map(p => `
          <li>
            <a href="./${p.slug}.html"><strong>${p.title}</strong></a>
            <p class="date">${p.date}</p>
          </li>
        `).join('')}
      </ul>
    `).join('')}
  `;
  await writeFile(join(OUTPUT_DIR, 'archive.html'), template('Archive', archiveContent, true));
  console.log('  ✓ archive.html');
  
  // Generate RSS feed
  const rss = generateRSS(posts, SITE_URL);
  await writeFile(join(OUTPUT_DIR, 'feed.xml'), rss);
  console.log('  ✓ feed.xml\n');
  
  // Process standalone pages (if pages/ exists)
  let pageCount = 0;
  if (existsSync(PAGES_DIR)) {
    const pageFiles = (await readdir(PAGES_DIR)).filter(f => f.endsWith('.md'));
    for (const file of pageFiles) {
      const content = await readFile(join(PAGES_DIR, file), 'utf-8');
      const { meta, body } = parseFrontmatter(content);
      const html = await marked(body);
      const slug = basename(file, '.md');
      
      const pageHtml = template(
        meta.title || slug,
        `<article>
          <h1>${meta.title || slug}</h1>
          ${html}
        </article>`,
        true // treat as index-like (no back link)
      );
      
      await writeFile(join(OUTPUT_DIR, `${slug}.html`), pageHtml);
      console.log(`  ✓ ${slug}.html (page)`);
      pageCount++;
    }
  }
  
  // Copy favicon
  await copyFile('./favicon.svg', join(OUTPUT_DIR, 'favicon.svg'));
  console.log('  ✓ favicon.svg\n');
  
  console.log(`✨ Built ${posts.length} post(s)${pageCount > 0 ? ` and ${pageCount} page(s)` : ''} to ${OUTPUT_DIR}/`);
  console.log('   Open _site/index.html in a browser to view!');
}

build().catch(console.error);
