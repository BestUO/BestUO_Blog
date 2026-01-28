// Blog posts data handler
let posts = [];

// Load posts from JSON file
async function loadPosts() {
    try {
        const response = await fetch('data/posts.json');
        posts = await response.json();
        displayPosts();
    } catch (error) {
        console.error('Error loading posts:', error);
        document.getElementById('postsGrid').innerHTML = '<p class="loading">Error loading blog posts. Please try again later.</p>';
    }
}

// Display posts in grid
function displayPosts() {
    const postsGrid = document.getElementById('postsGrid');
    
    if (posts.length === 0) {
        postsGrid.innerHTML = '<p class="loading">No posts available.</p>';
        return;
    }

    postsGrid.innerHTML = posts.map(post => `
        <article class="post-card" onclick="viewPost(${post.id})">
            <div class="post-image"></div>
            <div class="post-content">
                <div class="post-meta">
                    <span class="category-tag">${post.category}</span>
                    <span class="date">${formatDate(post.date)}</span>
                </div>
                <h3>${post.title}</h3>
                <p>${post.excerpt}</p>
                <a href="#" class="read-more" onclick="event.preventDefault()">Read More →</a>
            </div>
        </article>
    `).join('');
}

// Format date to readable format
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Navigate to post detail page
function viewPost(postId) {
    window.location.href = `post.html?id=${postId}`;
}

// Initialize blog when DOM is loaded
document.addEventListener('DOMContentLoaded', loadPosts);
