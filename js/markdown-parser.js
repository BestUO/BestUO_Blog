// Enhanced Markdown Parser with comprehensive feature support
// Supports ordered lists, tables, and mermaid code blocks

class MarkdownParser {
    constructor() {
        // GFM-style table regex
        this.tableRegex = /^\|(.+)\|\s*\n\|[\s:|-]+\|\s*\n((?:\|.+\|\s*\n?)+)/gm;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    parseTable(match, headers, rows) {
        // Parse headers
        const headerCells = headers.split('|').map(h => h.trim()).filter(h => h);
        
        // Parse rows
        const rowLines = rows.trim().split('\n');
        const rowData = rowLines.map(row => {
            return row.split('|').map(cell => cell.trim()).filter(cell => cell);
        });
        
        // Build HTML table
        let html = '<table>\n<thead>\n<tr>\n';
        headerCells.forEach(header => {
            html += `<th>${this.parseInline(header)}</th>`;
        });
        html += '</tr>\n</thead>\n<tbody>\n';
        
        rowData.forEach(row => {
            html += '<tr>\n';
            row.forEach(cell => {
                html += `<td>${this.parseInline(cell)}</td>`;
            });
            html += '</tr>\n';
        });
        
        html += '</tbody>\n</table>';
        return html;
    }
    
    parseInline(text) {
        // Parse inline markdown (bold, italic, code, links)
        let result = text;
        
        // Code (must come before bold/italic)
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Links
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        return result;
    }
    
    parseOrderedList(text) {
        // Match ordered list blocks
        const listRegex = /^(\d+)\.\s+(.+)$/gm;
        let match;
        const items = [];
        let lastIndex = 0;
        
        while ((match = listRegex.exec(text)) !== null) {
            items.push({
                index: match.index,
                number: match[1],
                content: match[2],
                fullMatch: match[0]
            });
            lastIndex = match.index + match[0].length;
        }
        
        if (items.length === 0) return text;
        
        // Build the ordered list HTML
        let result = text;
        let offset = 0;
        
        let i = 0;
        while (i < items.length) {
            let listHtml = '<ol>\n';
            let consecutiveItems = [items[i]];
            
            // Find consecutive list items
            let j = i + 1;
            while (j < items.length) {
                const prevEnd = items[j-1].index + items[j-1].fullMatch.length;
                const currentStart = items[j].index;
                // Check if items are consecutive (only whitespace between)
                const between = text.substring(prevEnd, currentStart);
                if (between.trim() === '' || between === '\n') {
                    consecutiveItems.push(items[j]);
                    j++;
                } else {
                    break;
                }
            }
            
            // Build list items
            consecutiveItems.forEach(item => {
                listHtml += `<li>${this.parseInline(item.content)}</li>\n`;
            });
            listHtml += '</ol>';
            
            // Replace in result
            const startIdx = consecutiveItems[0].index + offset;
            const endIdx = consecutiveItems[consecutiveItems.length - 1].index + 
                          consecutiveItems[consecutiveItems.length - 1].fullMatch.length + offset;
            
            result = result.substring(0, startIdx) + listHtml + result.substring(endIdx);
            offset += listHtml.length - (endIdx - startIdx);
            
            i = j;
        }
        
        return result;
    }
    
    parseUnorderedList(html) {
        // Wrap consecutive <li> tags in <ul>
        return html.replace(/(<li>.*?<\/li>\n?)+/g, match => {
            return '<ul>\n' + match + '</ul>\n';
        });
    }
    
    async parse(markdown) {
        let html = markdown;
        
        // Extract code blocks first to protect them
        const codeBlocks = [];
        html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
            const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
            if (lang === 'mermaid') {
                codeBlocks.push(`<div class="mermaid-container"><div class="mermaid">${this.escapeHtml(code)}</div></div>`);
            } else {
                const langClass = lang ? ` class="language-${lang}"` : '';
                codeBlocks.push(`<pre><code${langClass}>${this.escapeHtml(code)}</code></pre>`);
            }
            return placeholder;
        });
        
        // Parse tables
        html = html.replace(this.tableRegex, (match, headers, rows) => {
            return this.parseTable(match, headers, rows);
        });
        
        // Parse ordered lists
        html = this.parseOrderedList(html);
        
        // Headers (must be on their own line)
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // Unordered lists (simplified)
        html = html.replace(/^[\-\*\+]\s+(.+)$/gm, '<li>$1</li>');
        html = this.parseUnorderedList(html);
        
        // Inline code (must come before bold/italic)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        // Restore code blocks
        codeBlocks.forEach((block, index) => {
            html = html.replace(`___CODE_BLOCK_${index}___`, block);
        });
        
        // Convert double line breaks to paragraphs
        const lines = html.split('\n\n');
        html = lines.map(block => {
            block = block.trim();
            if (block === '') return '';
            
            // Don't wrap if already has HTML tags
            if (block.match(/^<(h[1-6]|ul|ol|table|pre|div)/)) {
                return block;
            }
            
            return '<p>' + block + '</p>';
        }).join('\n');
        
        return html;
    }
}

// Make it globally available
window.MarkdownParser = MarkdownParser;
