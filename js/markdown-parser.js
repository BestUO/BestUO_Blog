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
    
    sanitizeUrl(url) {
        // Decode HTML entities first
        const div = document.createElement('div');
        div.innerHTML = url;
        const decodedUrl = div.textContent;
        
        // Block javascript: and other potentially dangerous schemes
        const trimmedUrl = decodedUrl.trim().toLowerCase();
        if (trimmedUrl.startsWith('javascript:') || 
            trimmedUrl.startsWith('data:') || 
            trimmedUrl.startsWith('vbscript:')) {
            return '';
        }
        
        return decodedUrl;
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
        
        // Parse inline markdown (bold, italic, code, links, images)
        // Code (must come before bold/italic)
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Images (must come before links to avoid conflict)
        result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
            const sanitizedUrl = this.escapeHtml(this.sanitizeUrl(url));
            const escapedAlt = alt; // Already HTML-escaped due to escapeHtml() on input
            return `<img src="${sanitizedUrl}" alt="${escapedAlt}" class="markdown-image">`;
        });
        
        // Links (already escaped, so we need to unescape the URL part)
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            const sanitizedUrl = this.escapeHtml(this.sanitizeUrl(url));
            return `<a href="${sanitizedUrl}">${text}</a>`;
        });
        
        return result;
    }
    
    parseNestedList(text) {
        // Parse both ordered and unordered lists with nesting support
        // Matches lines starting with optional indent (tabs/spaces) followed by list markers
        const lines = text.split('\n');
        const result = [];
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i];
            // Match list item: optional indent + (number. or -/*) + space + content
            const listMatch = line.match(/^([\t ]*)((\d+)\.|[-*+])\s+(.*)$/);
            
            if (listMatch) {
                // Start of a list block
                const listLines = [];
                
                // Collect all consecutive list lines
                while (i < lines.length) {
                    const currentLine = lines[i];
                    const currentMatch = currentLine.match(/^([\t ]*)((\d+)\.|[-*+])\s+(.*)$/);
                    
                    if (currentMatch) {
                        listLines.push({
                            indent: currentMatch[1],
                            marker: currentMatch[2],
                            number: currentMatch[3] || null, // null for unordered
                            content: currentMatch[4],
                            raw: currentLine
                        });
                        i++;
                    } else if (currentLine.trim() === '') {
                        // Empty line might end the list or continue
                        // Check if next non-empty line is a list item
                        let j = i + 1;
                        while (j < lines.length && lines[j].trim() === '') {
                            j++;
                        }
                        if (j < lines.length && lines[j].match(/^([\t ]*)((\d+)\.|[-*+])\s+(.*)$/)) {
                            i++;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                
                // Build nested list HTML
                if (listLines.length > 0) {
                    result.push(this.buildNestedListHtml(listLines));
                }
            } else {
                result.push(line);
                i++;
            }
        }
        
        return result.join('\n');
    }
    
    getIndentLevel(indent) {
        // Count indent level: each tab = 1 level, 2 spaces = 1 level
        let level = 0;
        for (const char of indent) {
            if (char === '\t') {
                level += 1;
            } else if (char === ' ') {
                level += 0.5; // 2 spaces = 1 level
            }
        }
        return Math.floor(level);
    }
    
    buildNestedListHtml(items) {
        // Build HTML for nested lists
        const buildList = (startIndex, baseLevel) => {
            let html = '';
            let i = startIndex;
            let listType = null;
            let listStarted = false;
            
            while (i < items.length) {
                const item = items[i];
                const itemLevel = this.getIndentLevel(item.indent);
                
                if (itemLevel < baseLevel) {
                    // This item belongs to a parent level, stop
                    break;
                }
                
                if (itemLevel > baseLevel) {
                    // This item is a nested list, recurse
                    const nested = buildList(i, itemLevel);
                    // Insert nested list inside the last <li>
                    if (html.endsWith('</li>\n')) {
                        html = html.slice(0, -6) + '\n' + nested.html + '</li>\n';
                    } else {
                        html += nested.html;
                    }
                    i = nested.endIndex;
                    continue;
                }
                
                // itemLevel === baseLevel
                const currentType = item.number !== null ? 'ol' : 'ul';
                
                if (!listStarted) {
                    listType = currentType;
                    html += `<${listType}>\n`;
                    listStarted = true;
                } else if (currentType !== listType) {
                    // Type changed at same level, close and start new list
                    html += `</${listType}>\n`;
                    listType = currentType;
                    html += `<${listType}>\n`;
                }
                
                html += `<li>${this.parseInline(item.content)}</li>\n`;
                i++;
            }
            
            if (listStarted) {
                html += `</${listType}>\n`;
            }
            
            return { html, endIndex: i };
        };
        
        return buildList(0, 0).html;
    }
    
    parse(markdown) {
        let html = markdown;
        
        // Extract code blocks first to protect them
        const codeBlocks = [];
        html = html.replace(/```([a-zA-Z0-9_+#.-]*)?\n([\s\S]+?)```/g, (match, lang, code) => {
            const placeholder = `${this.codeBlockPrefix}${codeBlocks.length}${this.codeBlockSuffix}`;
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
        
        // Parse nested lists (both ordered and unordered with hierarchy support)
        html = this.parseNestedList(html);
        
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
        
        // Inline code (must come before bold/italic)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Images (must come before links to avoid conflict)
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
            // Sanitize URL and escape HTML to prevent attribute injection
            const sanitizedUrl = this.escapeHtml(this.sanitizeUrl(url));
            return `<img src="${sanitizedUrl}" alt="${this.escapeHtml(alt)}" class="markdown-image">`;
        });
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            // Sanitize URL and escape HTML to prevent attribute injection
            const sanitizedUrl = this.escapeHtml(this.sanitizeUrl(url));
            return `<a href="${sanitizedUrl}">${text}</a>`;
        });
        
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
            
            // Convert single line breaks to <br> tags for proper HTML display
            block = block.replace(/\n/g, '<br>');
            
            return '<p>' + block + '</p>';
        }).join('\n');
        
        return html;
    }
}

// Make it globally available
window.MarkdownParser = MarkdownParser;
