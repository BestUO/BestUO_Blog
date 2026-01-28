// Simple Markdown Parser
// Supports basic markdown features and mermaid code blocks

class MarkdownParser {
    constructor() {
        this.rules = [
            // Headers
            { pattern: /^### (.*$)/gim, replacement: '<h3>$1</h3>' },
            { pattern: /^## (.*$)/gim, replacement: '<h2>$1</h2>' },
            { pattern: /^# (.*$)/gim, replacement: '<h1>$1</h1>' },
            
            // Bold
            { pattern: /\*\*(.+?)\*\*/g, replacement: '<strong>$1</strong>' },
            
            // Italic
            { pattern: /\*(.+?)\*/g, replacement: '<em>$1</em>' },
            
            // Links
            { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2">$1</a>' },
            
            // Code blocks with language (special handling for mermaid)
            { pattern: /```(\w+)\n([\s\S]+?)```/g, replacement: (match, lang, code) => {
                if (lang === 'mermaid') {
                    return `<div class="mermaid-container"><div class="mermaid">${this.escapeHtml(code)}</div></div>`;
                }
                return `<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`;
            }},
            
            // Inline code
            { pattern: /`(.+?)`/g, replacement: '<code>$1</code>' },
            
            // Lists (simplified)
            { pattern: /^\- (.+)$/gim, replacement: '<li>$1</li>' },
        ];
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    parse(markdown) {
        let html = markdown;
        
        // Apply all rules
        this.rules.forEach(rule => {
            if (typeof rule.replacement === 'function') {
                html = html.replace(rule.pattern, rule.replacement);
            } else {
                html = html.replace(rule.pattern, rule.replacement);
            }
        });
        
        // Wrap consecutive <li> tags in <ul>
        html = html.replace(/(<li>.*<\/li>\n?)+/g, match => {
            return '<ul>' + match + '</ul>';
        });
        
        // Convert line breaks to paragraphs
        html = html.split('\n\n').map(block => {
            // Skip blocks that are already wrapped in HTML tags
            if (block.trim().startsWith('<')) {
                return block;
            }
            // Skip empty blocks
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
