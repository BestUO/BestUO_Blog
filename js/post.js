// Post detail page handler
let posts = [];

// Get post ID from URL
function getPostIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = parseInt(urlParams.get('id'));
    return isNaN(id) ? null : id;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sanitize URL for use in CSS context
function sanitizeUrl(url) {
    // Validate that the URL starts with http:// or https://
    if (!url || typeof url !== 'string') {
        return '';
    }
    
    // Check if URL starts with allowed protocols
    if (!url.match(/^https?:\/\//i)) {
        return '';
    }
    
    // Escape special characters that could break out of CSS url() context
    // Replace single quotes, backslashes, and newlines
    return url.replace(/['\\\n\r]/g, (match) => {
        return '\\' + match.charCodeAt(0).toString(16) + ' ';
    });
}

// Load and render markdown content
async function loadMarkdownContent(contentFile) {
    try {
        const response = await fetch(contentFile);
        if (!response.ok) {
            throw new Error(`Failed to load markdown file: ${contentFile} (HTTP ${response.status})`);
        }
        const markdown = await response.text();
        
        // Parse markdown to HTML using our enhanced parser (supports tables, ordered lists, etc.)
        const parser = new MarkdownParser();
        const html = parser.parse(markdown);
        return html;
    } catch (error) {
        console.error('Error loading markdown:', error);
        return '<p>Error loading content.</p>';
    }
}

// Render mermaid diagrams
async function renderMermaidDiagrams() {
    // Wait for content to be inserted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const renderer = new MermaidRenderer();
    await renderer.render();
}

// Load posts data
async function loadPosts() {
    try {
        const response = await fetch('data/posts.json');
        posts = await response.json();
        await displayPost();
    } catch (error) {
        console.error('Error loading post:', error);
        document.getElementById('postDetail').innerHTML = '<p class="loading">Error loading post. Please try again later.</p>';
    }
}

// Display the post
async function displayPost() {
    const postId = getPostIdFromUrl();
    const postDetail = document.getElementById('postDetail');
    
    if (postId === null) {
        postDetail.innerHTML = '<p class="loading">Invalid post ID.</p>';
        return;
    }
    
    const post = posts.find(p => p.id === postId);
    
    if (!post) {
        postDetail.innerHTML = '<p class="loading">Post not found.</p>';
        return;
    }

    // Update page title
    document.title = `${escapeHtml(post.title)} - BestUO Blog`;

    // Load markdown content
    const content = await loadMarkdownContent(post.contentFile);

    postDetail.innerHTML = `
        <div class="post-image" ${post.imageUrl ? `style="background-image: url('${sanitizeUrl(post.imageUrl)}');"` : ''}></div>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta">
            <span class="category-tag">${escapeHtml(post.category)}</span>
            <span>By ${escapeHtml(post.author)}</span>
            <span>${formatDate(post.date)}</span>
        </div>
        <div class="content">
            ${content}
        </div>
    `;
    
    // Render mermaid diagrams if any
    await renderMermaidDiagrams();
}

// Format date to readable format
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Initialize post page when DOM is loaded
document.addEventListener('DOMContentLoaded', loadPosts);
