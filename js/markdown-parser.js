// Enhanced Markdown Parser using marked.js library
// Supports comprehensive markdown features including ordered lists, tables, and mermaid code blocks

class MarkdownParser {
    constructor() {
        this.markedLoaded = false;
        this.markedPromise = this.loadMarked();
    }
    
    async loadMarked() {
        // Check if marked is already loaded
        if (window.marked) {
            this.markedLoaded = true;
            this.configureMarked();
            return;
        }
        
        try {
            // Load marked.js from CDN
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/marked@11.1.1/marked.min.js';
            script.async = false;
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load marked.js'));
                document.head.appendChild(script);
            });
            
            // Wait a bit for marked to be available
            for (let i = 0; i < 20 && !window.marked; i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            if (!window.marked) {
                throw new Error('marked.js not available after loading');
            }
            
            this.markedLoaded = true;
            this.configureMarked();
        } catch (error) {
            console.error('Error loading marked.js:', error);
            this.markedLoaded = false;
        }
    }
    
    configureMarked() {
        if (!window.marked) return;
        
        // Configure marked with custom renderer for mermaid blocks
        const renderer = new marked.Renderer();
        
        // Override code block rendering to handle mermaid specially
        const originalCode = renderer.code.bind(renderer);
        renderer.code = (code, language) => {
            if (language === 'mermaid') {
                return `<div class="mermaid-container"><div class="mermaid">${this.escapeHtml(code)}</div></div>`;
            }
            return originalCode(code, language);
        };
        
        // Configure marked options
        marked.setOptions({
            renderer: renderer,
            gfm: true,              // GitHub Flavored Markdown
            breaks: false,          // Don't convert \n to <br>
            pedantic: false,
            smartLists: true,       // Better list handling
            smartypants: false,
            headerIds: true,
            mangle: false,
            sanitize: false         // We trust our own content
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async parse(markdown) {
        // Wait for marked to load if it hasn't yet
        await this.markedPromise;
        
        if (!this.markedLoaded || !window.marked) {
            console.error('marked.js not loaded, falling back to basic parsing');
            return this.fallbackParse(markdown);
        }
        
        try {
            // Parse markdown using marked.js
            const html = marked.parse(markdown);
            return html;
        } catch (error) {
            console.error('Error parsing markdown with marked:', error);
            return this.fallbackParse(markdown);
        }
    }
    
    // Fallback parser for when marked.js fails to load
    fallbackParse(markdown) {
        let html = markdown;
        
        // Basic rules for fallback
        const rules = [
            { pattern: /^### (.*$)/gim, replacement: '<h3>$1</h3>' },
            { pattern: /^## (.*$)/gim, replacement: '<h2>$1</h2>' },
            { pattern: /^# (.*$)/gim, replacement: '<h1>$1</h1>' },
            { pattern: /\*\*(.+?)\*\*/g, replacement: '<strong>$1</strong>' },
            { pattern: /\*(.+?)\*/g, replacement: '<em>$1</em>' },
            { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2">$1</a>' },
            { pattern: /```(\w+)\n([\s\S]+?)```/g, replacement: (match, lang, code) => {
                if (lang === 'mermaid') {
                    return `<div class="mermaid-container"><div class="mermaid">${this.escapeHtml(code)}</div></div>`;
                }
                return `<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`;
            }},
            { pattern: /`(.+?)`/g, replacement: '<code>$1</code>' },
            { pattern: /^\- (.+)$/gim, replacement: '<li>$1</li>' },
        ];
        
        rules.forEach(rule => {
            if (typeof rule.replacement === 'function') {
                html = html.replace(rule.pattern, rule.replacement);
            } else {
                html = html.replace(rule.pattern, rule.replacement);
            }
        });
        
        html = html.replace(/(<li>.*<\/li>\n?)+/g, match => {
            return '<ul>' + match + '</ul>';
        });
        
        html = html.split('\n\n').map(block => {
            if (block.trim().startsWith('<')) {
                return block;
            }
            if (block.trim() === '') {
                return '';
            }
            return '<p>' + block.trim() + '</p>';
        }).join('\n');
        
        return html;
    }
}

// Make it globally available
window.MarkdownParser = MarkdownParser;
