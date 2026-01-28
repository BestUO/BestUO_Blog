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

// Load posts data
async function loadPosts() {
    try {
        const response = await fetch('data/posts.json');
        posts = await response.json();
        displayPost();
    } catch (error) {
        console.error('Error loading post:', error);
        document.getElementById('postDetail').innerHTML = '<p class="loading">Error loading post. Please try again later.</p>';
    }
}

// Display the post
function displayPost() {
    const postId = getPostIdFromUrl();
    
    if (postId === null) {
        postDetail.innerHTML = '<p class="loading">Invalid post ID.</p>';
        return;
    }
    
    const post = posts.find(p => p.id === postId);
    const postDetail = document.getElementById('postDetail');
    
    if (!post) {
        postDetail.innerHTML = '<p class="loading">Post not found.</p>';
        return;
    }

    // Update page title
    document.title = `${escapeHtml(post.title)} - BestUO Blog`;

    postDetail.innerHTML = `
        <div class="post-image"></div>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta">
            <span class="category-tag">${escapeHtml(post.category)}</span>
            <span>By ${escapeHtml(post.author)}</span>
            <span>${formatDate(post.date)}</span>
        </div>
        <div class="content">
            ${post.content}
        </div>
    `;
}

// Format date to readable format
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Initialize post page when DOM is loaded
document.addEventListener('DOMContentLoaded', loadPosts);
