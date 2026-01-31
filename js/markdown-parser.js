// Enhanced Markdown Parser with comprehensive feature support
// Supports ordered lists, tables, and mermaid code blocks

class MarkdownParser {
    constructor() {
        // GFM-style table regex
        this.tableRegex = /^\|(.+)\|\s*\n\|[\s:|-]+\|\s*\n((?:\|.+\|\s*\n?)+)/gm;
        // Unique placeholder to avoid collision with user content
        this.codeBlockPrefix = '\x00__MDPARSE_CODEBLOCK_';
        this.codeBlockSuffix = '__\x00';
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
            // Pad rows to match header count if needed
            for (let i = 0; i < headerCells.length; i++) {
                const cell = row[i] || '';
                html += `<td>${this.parseInline(cell)}</td>`;
            }
            html += '</tr>\n';
        });
        
    html += '</tbody>\n</table>';
    return html + '\n\n';
    }
    
    parseInline(text) {
        // Escape HTML first to prevent XSS
        let result = this.escapeHtml(text);
        
        // Parse inline markdown (bold, italic, code, links)
        // Code (must come before bold/italic)
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Links (already escaped, so we need to unescape the URL part)
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            // Create a temporary div to decode HTML entities in URL
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = url;
            const decodedUrl = tempDiv.textContent;
            return `<a href="${decodedUrl}">${text}</a>`;
        });
        
        return result;
    }
    
    parseOrderedList(text) {
        // Match ordered list blocks - only at start of line
        const listRegex = /^(\d+)\.\s+(.+)$/gm;
        let match;
        const items = [];
        
        while ((match = listRegex.exec(text)) !== null) {
            items.push({
                index: match.index,
                number: match[1],
                content: match[2],
                fullMatch: match[0]
            });
        }
        
        if (items.length === 0) return text;
        
        // Build the ordered list HTML
        let result = text;
        let offset = 0;
        
        let currentIndex = 0;
        while (currentIndex < items.length) {
            let listHtml = '<ol>\n';
            let consecutiveItems = [items[currentIndex]];
            
            // Find consecutive list items
            let nextIndex = currentIndex + 1;
            while (nextIndex < items.length) {
                const prevEnd = items[nextIndex-1].index + items[nextIndex-1].fullMatch.length;
                const currentStart = items[nextIndex].index;
                // Check if items are consecutive (only whitespace between)
                const between = text.substring(prevEnd, currentStart);
                if (between.trim() === '' || between === '\n') {
                    consecutiveItems.push(items[nextIndex]);
                    nextIndex++;
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
            
            currentIndex = nextIndex;
        }
        
        return result;
    }
    
    parseUnorderedList(html) {
        // Wrap only unordered list <li> tags (tagged with data-list="ul")
        return html
            .replace(/(<li data-list="ul">[\s\S]*?<\/li>\n?)+/g, match => {
                return '<ul>\n' + match + '</ul>\n';
            })
            .replace(/<li data-list="ul">/g, '<li>');
    }
    
    parse(markdown) {
        let html = markdown;
        
        // Extract code blocks first to protect them
        const codeBlocks = [];
        // Support both Unix (LF) and Windows (CRLF) line endings
        html = html.replace(/```(\w+)?\r?\n([\s\S]+?)```/g, (match, lang, code) => {
            const placeholder = `${this.codeBlockPrefix}${codeBlocks.length}${this.codeBlockSuffix}`;
            // Normalize CRLF to LF in code content
            code = code.replace(/\r\n/g, '\n');
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
        html = html.replace(/^### (.+)$/gm, (match, text) => {
            return `<h3>${this.escapeHtml(text)}</h3>`;
        });
        html = html.replace(/^## (.+)$/gm, (match, text) => {
            return `<h2>${this.escapeHtml(text)}</h2>`;
        });
        html = html.replace(/^# (.+)$/gm, (match, text) => {
            return `<h1>${this.escapeHtml(text)}</h1>`;
        });
        
        // Unordered lists (simplified) - escape content
        html = html.replace(/^[\-\*\+]\s+(.+)$/gm, (match, text) => {
            return `<li data-list="ul">${this.escapeHtml(text)}</li>`;
        });
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
            const placeholder = `${this.codeBlockPrefix}${index}${this.codeBlockSuffix}`;
            html = html.replace(placeholder, block);
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
