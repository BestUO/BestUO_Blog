// Blog posts data handler
let posts = [];
let currentCategory = 'All';
let categoryListenerAttached = false;

// Load posts from JSON file
async function loadPosts() {
    try {
        const response = await fetch('data/posts.json');
        posts = await response.json();
        displayCategories();
        displayPosts();
    } catch (error) {
        console.error('Error loading posts:', error);
        document.getElementById('postsGrid').innerHTML = '<p class="loading">Error loading blog posts. Please try again later.</p>';
    }
}

// Extract unique categories from posts
function getCategories() {
    const categories = posts
        .map(post => post.category)
        .filter(category => category && typeof category === 'string'); // Filter out null/undefined
    return [...new Set(categories)].sort();
}

// Display categories in sidebar
function displayCategories() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) {
        console.error('Category list element not found');
        return;
    }
    
    const categories = getCategories();
    let html = '';
    
    // Group posts by category
    const postsByCategory = {};
    posts.forEach(post => {
        if (post.category && typeof post.category === 'string') {
            if (!postsByCategory[post.category]) {
                postsByCategory[post.category] = [];
            }
            postsByCategory[post.category].push(post);
        }
    });
    
    // Create "All Posts" section
    html += `
        <li class="category-section">
            <div class="category-header">
                <a href="#" data-category="All" class="category-link active">
                    All Posts <span class="count">${posts.length}</span>
                </a>
            </div>
        </li>
    `;
    
    // Add individual categories with their posts (collapsed by default)
    categories.forEach((category, index) => {
        const categoryPosts = postsByCategory[category] || [];
        const postListId = `post-list-${index}`;
        html += `
            <li class="category-section collapsed">
                <div class="category-header" data-category-name="${escapeHtml(category)}" role="button" aria-expanded="false" aria-controls="${postListId}" tabindex="0">
                    <div class="category-header-content">
                        <span class="expand-icon"></span>
                        <span class="category-name">${escapeHtml(category)}</span>
                    </div>
                    <span class="count">${categoryPosts.length}</span>
                </div>
                <ul class="post-list" id="${postListId}">
        `;
        
        // Add posts under this category
        categoryPosts.forEach(post => {
            html += `
                <li class="post-item">
                    <a href="#" data-post-id="${post.id}" class="post-link">
                        ${escapeHtml(post.title)}
                    </a>
                </li>
            `;
        });
        
        html += `
                </ul>
            </li>
        `;
    });
    
    categoryList.innerHTML = html;
    
    // Use event delegation for better performance - attach only once
    if (!categoryListenerAttached) {
        // Handle click events
        categoryList.addEventListener('click', (e) => {
            // Handle category header click for expand/collapse
            const categoryHeader = e.target.closest('.category-header');
            if (categoryHeader && categoryHeader.hasAttribute('data-category-name')) {
                e.preventDefault();
                toggleCategory(categoryHeader);
                return;
            }
            
            // Handle category link click (All Posts)
            const categoryLink = e.target.closest('.category-link');
            if (categoryLink) {
                e.preventDefault();
                const category = categoryLink.getAttribute('data-category');
                filterByCategory(category);
                return;
            }
            
            // Handle post link click
            const postLink = e.target.closest('.post-link');
            if (postLink) {
                e.preventDefault();
                const postId = postLink.getAttribute('data-post-id');
                viewPost(postId);
                return;
            }
        });
        
        // Handle keyboard events for accessibility
        categoryList.addEventListener('keydown', (e) => {
            const categoryHeader = e.target.closest('.category-header');
            if (categoryHeader && categoryHeader.hasAttribute('data-category-name')) {
                // Toggle on Enter or Space key
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCategory(categoryHeader);
                }
            }
        });
        
        categoryListenerAttached = true;
    }
}

// Toggle category expand/collapse state
function toggleCategory(categoryHeader) {
    const categorySection = categoryHeader.closest('.category-section');
    const isCollapsed = categorySection.classList.contains('collapsed');
    
    // Toggle collapsed class
    categorySection.classList.toggle('collapsed');
    
    // Update aria-expanded attribute for accessibility
    categoryHeader.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
}

// Filter posts by category
function filterByCategory(category) {
    currentCategory = category;
    
    // Update active state for category links
    document.querySelectorAll('.category-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-category') === category) {
            link.classList.add('active');
        }
    });
    
    displayPosts();
}

// Display posts in grid
function displayPosts() {
    const postsGrid = document.getElementById('postsGrid');
    
    // Filter posts by category
    const filteredPosts = currentCategory === 'All' 
        ? posts 
        : posts.filter(post => post.category === currentCategory);
    
    if (filteredPosts.length === 0) {
        postsGrid.innerHTML = '<p class="loading">No posts available in this category.</p>';
        return;
    }

    postsGrid.innerHTML = filteredPosts.map(post => `
        <article class="post-card" data-post-id="${post.id}">
            <div class="post-image" ${post.imageUrl ? `style="background-image: url('${sanitizeUrl(post.imageUrl)}');"` : ''}></div>
            <div class="post-content">
                <div class="post-meta">
                    <span class="category-tag">${escapeHtml(post.category)}</span>
                    <span class="date">${formatDate(post.date)}</span>
                </div>
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.excerpt)}</p>
                <span class="read-more">Read More →</span>
            </div>
        </article>
    `).join('');
    
    // Add click event listeners to post cards
    document.querySelectorAll('.post-card').forEach(card => {
        card.addEventListener('click', () => {
            const postId = card.getAttribute('data-post-id');
            viewPost(postId);
        });
    });
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
