// blog.js — Client-side blog page logic
// No framework, no build step. Plain JavaScript.

// ---------------------------------------------------------------------------
// Frontmatter Parser
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
    const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]+([\s\S]*)$/;
    const match = frontmatterRegex.exec(content);
    
    if (!match) {
        return {
            metadata: {},
            content: content
        };
    }
    
    const frontmatterStr = match[1];
    const contentStr = match[2];
    
    const metadata = {};
    const lines = frontmatterStr.split(/\r?\n/);
    let currentKey = null;
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        if (line.startsWith('- ')) {
            if (currentKey && Array.isArray(metadata[currentKey])) {
                metadata[currentKey].push(line.slice(2).trim());
            }
            continue;
        }
        
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        
        if (!value) {
            metadata[key] = [];
            currentKey = key;
        } else {
            metadata[key] = value;
            currentKey = null;
        }
    }
    
    return {
        metadata,
        content: contentStr
    };
}

// ---------------------------------------------------------------------------
// ExcerptExtractor
// ---------------------------------------------------------------------------

function extractExcerpt(markdown) {
    if (typeof markdown !== 'string' || markdown.trim() === '') {
        return '';
    }

    let text = markdown;

    text = text.replace(/^```[\s\S]*?^```/gm, '');
    text = text.replace(/^~~~[\s\S]*?^~~~/gm, '');
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '');
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    text = text.replace(/^#{1,6}\s+/gm, '');
    text = text.replace(/\*\*([^*]*)\*\*/g, '$1');
    text = text.replace(/__([^_]*)__/g, '$1');
    text = text.replace(/\*([^*]*)\*/g, '$1');
    text = text.replace(/_([^_]*)_/g, '$1');
    text = text.replace(/^>\s*/gm, '');
    text = text.replace(/^[-*]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');
    text = text.replace(/\s+/g, ' ').trim();

    if (text === '') {
        return '';
    }

    if (text.length > 150) {
        return text.slice(0, 150) + '…';
    }

    return text;
}

// ---------------------------------------------------------------------------
// Date Parsing
// ---------------------------------------------------------------------------

function parseDate(dateStr) {
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) {
        return 'Unknown Date';
    }
    
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return dateObj.toLocaleDateString('en-US', options);
}

// ---------------------------------------------------------------------------
// Main Application Logic
// ---------------------------------------------------------------------------

let postsCache = null;

async function loadManifest() {
    const response = await fetch('blog/manifest.json');
    if (!response.ok) throw new Error('Failed to load manifest');
    return response.json();
}

async function loadPost(filename) {
    const response = await fetch(`blog/${filename}`);
    if (!response.ok) throw new Error('Failed to load post');
    return response.text();
}

function renderPostList(posts) {
    const main = document.querySelector('main');
    main.innerHTML = `
        <div class="blog-list" style="width: 86%; margin: 0 auto;">
            ${posts.map(post => `
                <article class="blog-item" style="background: var(--bg-ter); border-top: 2px solid var(--brdr-1); border-radius: 16px; overflow: hidden; display: flex; width: 100%; transition: all 0.3s ease; align-items: stretch; margin-bottom: 20px; cursor: pointer;" data-slug="${post.slug}">
                    ${post.image ? `
                        <div class="blog-img-wrapper" style="flex: 0 0 280px; overflow: hidden;">
                            <img class="blog-img" src="${post.image}" alt="${post.title}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                        </div>
                    ` : ''}
                    <div class="blog-content" style="padding: 20px; display: flex; flex-direction: column; gap: 8px; flex: 1; padding-bottom: 20px;">
                        <div class="blog-meta" style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">
                            <span style="font-family: var(--fnt-j); font-size: 0.8em; padding: 4px 10px; border-radius: 8px; background: var(--bg-sec); color: var(--txt-m);">${post.date}</span>
                        </div>
                        <h3 style="margin-top: 0px; font-family: var(--fnt-h); font-size: 1.5em; font-weight: 600; margin-bottom: 0px !important;">${post.title}</h3>
                        <p style="font-family: var(--fnt-j); font-size: 1em; font-weight: 400; margin-top: -2px; margin-bottom: 0px !important;">${post.excerpt}</p>
                    </div>
                </article>
            `).join('')}
        </div>
    `;

    document.querySelectorAll('.blog-item').forEach(item => {
        item.addEventListener('click', () => {
            const slug = item.dataset.slug;
            window.location.hash = slug;
        });
    });
}

function renderPostView(post, content) {
    const main = document.querySelector('main');
    const htmlContent = marked.parse(content);
    
    main.innerHTML = `
        <div class="post-view" style="width: 86%; margin: 0 auto;">
            <button class="back-btn" style="font-family: var(--fnt-j); font-size: 1em; padding: 8px 16px; border-radius: 8px; background: var(--bg-sec); color: var(--txt-m); border: none; cursor: pointer; margin-bottom: 20px; transition: all 0.2s;">
                <i class="fas fa-arrow-left"></i> Back to Posts
            </button>
            <article class="post-content" style="background: var(--bg-ter); border-top: 2px solid var(--brdr-1); border-radius: 16px; padding: 30px;">
                ${post.image ? `
                    <img src="${post.image}" alt="${post.title}" style="width: 100%; height: 300px; object-fit: cover; border-radius: 12px; margin-bottom: 20px;">
                ` : ''}
                <div class="post-meta" style="margin-bottom: 20px;">
                    <span style="font-family: var(--fnt-j); font-size: 0.9em; color: var(--txt-m);">${post.date}</span>
                </div>
                <h1 style="font-family: var(--fnt-h); font-size: 2em; font-weight: 600; margin-bottom: 20px;">${post.title}</h1>
                <div class="post-body" style="font-family: var(--fnt-j); line-height: 1.8;">
                    ${htmlContent}
                </div>
            </article>
        </div>
    `;

    document.querySelector('.back-btn').addEventListener('click', () => {
        window.location.href = 'codelog.html';
    });
}

async function init() {
    try {
        console.log('Initializing blog...');
        const filenames = await loadManifest();
        console.log('Loaded filenames:', filenames);
        
        const posts = await Promise.all(filenames.map(async filename => {
            try {
                console.log('Loading post:', filename);
                const content = await loadPost(filename);
                console.log('Loaded content for', filename);
                const { metadata, content: markdownContent } = parseFrontmatter(content);
                const excerpt = extractExcerpt(markdownContent);
                const slug = filename.replace(/\.md$/, '');
                
                console.log('Parsed post:', { slug, title: metadata.title });
                
                return {
                    slug,
                    filename,
                    title: metadata.title || 'Untitled Post',
                    date: parseDate(metadata.date || filename),
                    image: metadata.image,
                    tags: metadata.tags || [],
                    content: markdownContent,
                    excerpt
                };
            } catch (error) {
                console.error('Error loading post', filename, error);
                return null;
            }
        }));
        
        const validPosts = posts.filter(post => post !== null);
        console.log('Valid posts:', validPosts);
        postsCache = validPosts;
        
        function handleHash() {
            const hash = window.location.hash.slice(1);
            console.log('Handling hash:', hash);
            if (hash) {
                const post = validPosts.find(p => p.slug === hash);
                if (post) {
                    renderPostView(post, post.content);
                    return;
                }
            }
            renderPostList(validPosts);
        }
        
        window.addEventListener('hashchange', handleHash);
        handleHash();
    } catch (error) {
        console.error('Error initializing blog:', error);
        const main = document.querySelector('main');
        main.innerHTML = `<div style="padding: 40px; text-align: center;">Error loading blog: ${error.message}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
