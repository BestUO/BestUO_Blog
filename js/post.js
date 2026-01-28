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

// Load and render markdown content
async function loadMarkdownContent(contentFile) {
    try {
        const response = await fetch(contentFile);
        if (!response.ok) {
            throw new Error(`Failed to load markdown file: ${contentFile}`);
        }
        const markdown = await response.text();
        
        // Configure marked to support code blocks
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: true,
            mangle: false
        });
        
        // Parse markdown to HTML
        const html = marked.parse(markdown);
        return html;
    } catch (error) {
        console.error('Error loading markdown:', error);
        return '<p>Error loading content.</p>';
    }
}

// Render mermaid diagrams
async function renderMermaidDiagrams() {
    // Wait a bit for content to be inserted into DOM
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const mermaidBlocks = document.querySelectorAll('pre code.language-mermaid');
    
    for (let i = 0; i < mermaidBlocks.length; i++) {
        const block = mermaidBlocks[i];
        const code = block.textContent;
        const pre = block.parentElement;
        
        try {
            // Create a container for the mermaid diagram
            const container = document.createElement('div');
            container.className = 'mermaid';
            container.textContent = code;
            
            // Replace the pre block with the mermaid container
            pre.parentElement.replaceChild(container, pre);
        } catch (error) {
            console.error('Error rendering mermaid diagram:', error);
        }
    }
    
    // Render all mermaid diagrams
    if (window.mermaid && document.querySelectorAll('.mermaid').length > 0) {
        try {
            await window.mermaid.run({
                querySelector: '.mermaid'
            });
        } catch (error) {
            console.error('Error running mermaid:', error);
        }
    }
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
        <div class="post-image"></div>
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
