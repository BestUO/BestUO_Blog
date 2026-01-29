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
            
            // Unordered lists
            { pattern: /^\- (.+)$/gim, replacement: '<li>$1</li>' },
            
            // Ordered lists (numbered)
            { pattern: /^\d+\.\s+(.+)$/gim, replacement: '<li class="ordered">$1</li>' },
        ];
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    parse(markdown) {
        let html = markdown;
        
        // Process tables first (before other replacements)
        html = this.parseTables(html);
        
        // Apply all rules
        this.rules.forEach(rule => {
            if (typeof rule.replacement === 'function') {
                html = html.replace(rule.pattern, rule.replacement);
            } else {
                html = html.replace(rule.pattern, rule.replacement);
            }
        });
        
        // Wrap consecutive <li class="ordered"> tags in <ol>
        html = html.replace(/(<li class="ordered">.*?<\/li>\n?)+/g, match => {
            // Remove the class attribute from list items within <ol>
            const cleanedMatch = match.replace(/ class="ordered"/g, '');
            return '<ol>' + cleanedMatch + '</ol>';
        });
        
        // Wrap consecutive <li> tags (unordered) in <ul>
        html = html.replace(/(<li>.*?<\/li>\n?)+/g, match => {
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
    
    parseTables(markdown) {
        // Match markdown tables: lines with pipes that form a table structure
        // This regex matches: header row, separator row, and one or more body rows  
        const tableRegex = /(\|.*\|)\n(\|[\s\-:|]+)\n((?:\|.*\|\n?)+)/gm;
        
        return markdown.replace(tableRegex, (match, header, separator, body) => {
            // Parse header
            const headerCells = header.split('|').slice(1, -1).map(cell => cell.trim());
            const headerHtml = '<thead><tr>' + 
                headerCells.map(cell => `<th>${cell}</th>`).join('') + 
                '</tr></thead>';
            
            // Parse body rows
            const rows = body.trim().split('\n').filter(row => row.trim());
            const bodyHtml = '<tbody>' + rows.map(row => {
                const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
                return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
            }).join('') + '</tbody>';
            
            // Add newlines before and after to ensure it's treated as a block
            return `\n\n<table>${headerHtml}${bodyHtml}</table>\n\n`;
        });
    }
}

// Make it globally available
window.MarkdownParser = MarkdownParser;
