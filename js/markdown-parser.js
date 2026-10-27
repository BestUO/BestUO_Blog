// Enhanced Markdown Parser with comprehensive feature support
// Supports ordered lists, tables, mermaid code blocks, and [TOC] tag

class MarkdownParser {
    constructor() {
        // GFM-style table regex
        this.tableRegex = /^\|(.+)\|\s*\n\|[\s:|-]+\|\s*\n((?:\|.+\|\s*\n?)+)/gm;
        // Unique placeholder to avoid collision with user content
        this.codeBlockPrefix = '\x00__MDPARSE_CODEBLOCK_';
        this.codeBlockSuffix = '__\x00';
        // TOC placeholder
        this.tocPlaceholder = '\x00__MDPARSE_TOC__\x00';
        // Track heading IDs to ensure uniqueness
        this.headingIds = new Map();
    }
    
    // Generate a unique slug from heading text
    generateSlug(text) {
        // Remove HTML tags and trim
        const cleanText = text.replace(/<[^>]+>/g, '').trim();
        // Convert to lowercase, replace spaces with hyphens, remove special characters
        // \u4e00-\u9fa5 represents CJK Unified Ideographs (Chinese characters)
        let slug = cleanText
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\u4e00-\u9fa5-]/g, ''); // Keep letters, numbers, Chinese characters, and hyphens
        
        // Handle empty slug
        if (!slug) {
            slug = 'heading';
        }
        
        // Make slug unique
        if (this.headingIds.has(slug)) {
            const count = this.headingIds.get(slug) + 1;
            this.headingIds.set(slug, count);
            slug = `${slug}-${count}`;
        } else {
            this.headingIds.set(slug, 0);
        }
        
        return slug;
    }
    
    // Extract headings from markdown and generate TOC HTML
    generateTOC(markdown) {
        const headings = [];
        // Match headings: # h1, ## h2, ### h3, #### h4
        const headingRegex = /^(#{1,4})\s+(.+)$/gm;
        let match;
        
        while ((match = headingRegex.exec(markdown)) !== null) {
            const level = match[1].length;
            const text = match[2].trim();
            const slug = this.generateSlug(text);
            if (level <= 3) {
                headings.push({ level, text, slug });
            }
        }
        
        if (headings.length === 0) {
            return '';
        }
        
        // Build TOC HTML
        let tocHtml = '<div class="toc-container">\n<nav class="toc">\n<h4 class="toc-title">目录</h4>\n<ul class="toc-list">\n';
        
        headings.forEach(heading => {
            const indentClass = heading.level > 1 ? ` toc-level-${heading.level}` : '';
            tocHtml += `<li class="toc-entry${indentClass}" data-level="${heading.level}"><a href="#${heading.slug}">${this.escapeHtml(heading.text)}</a></li>\n`;
        });
        
        tocHtml += '</ul>\n</nav>\n</div>';
        return tocHtml;
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

    parseBlockquotes(text) {
        const lines = text.split('\n');
        const result = [];
        let i = 0;

        while (i < lines.length) {
            if (!/^>\s?/.test(lines[i])) {
                result.push(lines[i]);
                i++;
                continue;
            }

            const quoteLines = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                quoteLines.push(lines[i].replace(/^>\s?/, ''));
                i++;
            }

            const quoteText = quoteLines.join('\n').trim();
            result.push(`<blockquote><p>${this.parseInline(quoteText).replace(/\n/g, '<br>')}</p></blockquote>`);
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
    
    // Reset heading ID tracking for a fresh parse
    resetHeadingIds() {
        this.headingIds = new Map();
    }

    buildTOC(headings) {
        if (headings.length === 0) {
            return '';
        }

        let tocHtml = '<div class="toc-container">\n<nav class="toc">\n<h4 class="toc-title">目录</h4>\n<ul class="toc-list">\n';
        headings.forEach(heading => {
            const indentClass = heading.depth > 1 ? ` toc-level-${heading.depth}` : '';
            tocHtml += `<li class="toc-entry${indentClass}" data-level="${heading.depth}"><a href="#${heading.slug}">${this.escapeHtml(heading.text)}</a></li>\n`;
        });
        return `${tocHtml}</ul>\n</nav>\n</div>`;
    }
    
    parse(markdown) {
        if (window.marked) {
            this.resetHeadingIds();
            const tocMarker = 'MDPARSETOCPLACEHOLDER';
            const hasToc = /^\[TOC\]\s*$/im.test(markdown);
            const markdownWithToc = hasToc
                ? markdown.replace(/^\[TOC\]\s*$/im, tocMarker)
                : markdown;
            const renderer = new window.marked.Renderer();
            const tocEntries = [];

            renderer.heading = ({ tokens, depth }) => {
                const text = window.marked.Parser.parseInline(tokens);
                const plainText = text.replace(/<[^>]+>/g, '');
                const slug = this.generateSlug(plainText);
                if (depth <= 3) {
                    tocEntries.push({ level: depth, text, slug });
                }
                return `<h${depth} id="${this.escapeHtml(slug)}">${text}</h${depth}>\n`;
            };

            let parsedHtml = window.marked.parse(markdownWithToc, {
                gfm: true,
                breaks: false,
                renderer
            });

            if (hasToc) {
                const tocHtml = this.buildTOC(tocEntries.map(entry => ({
                    depth: entry.level,
                    slug: entry.slug,
                    text: entry.text.replace(/<[^>]+>/g, '')
                })));
                parsedHtml = parsedHtml.replace(`<p>${tocMarker}</p>\n`, tocHtml);
            }

            parsedHtml = parsedHtml.replace(
                /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
                '<div class="mermaid-container"><div class="mermaid"><pre>$1</pre></div></div>'
            );

            return window.DOMPurify
                ? window.DOMPurify.sanitize(parsedHtml)
                : parsedHtml;
        }

        let html = markdown;
        
        // Reset heading IDs for TOC generation
        this.resetHeadingIds();
        
        // Check for [TOC] tag and generate TOC if present
        const hasToc = /^\[TOC\]$/im.test(markdown);
        let tocHtml = '';
        if (hasToc) {
            tocHtml = this.generateTOC(markdown);
            // Replace [TOC] with placeholder
            html = html.replace(/^\[TOC\]$/im, this.tocPlaceholder);
        }
        
        // Reset heading IDs again to generate same IDs for actual headings
        this.resetHeadingIds();
        
        // Extract code blocks first to protect them
        const codeBlocks = [];
        html = html.replace(/```([a-zA-Z0-9_+#.-]*)?\n([\s\S]+?)```/g, (match, lang, code) => {
            const placeholder = `${this.codeBlockPrefix}${codeBlocks.length}${this.codeBlockSuffix}`;
            if (lang === 'mermaid') {
                codeBlocks.push(`<div class="mermaid-container"><div class="mermaid"><pre>${this.escapeHtml(code)}</pre></div></div>`);
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
        
        // Parse block quotes before list and paragraph processing
        html = this.parseBlockquotes(html);

        // Parse nested lists (both ordered and unordered with hierarchy support)
        html = this.parseNestedList(html);

        // Horizontal rules are block-level elements
        html = html.replace(/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/gm, '<hr>');
        
        // Headers with ID for anchor links (must be on their own line)
        html = html.replace(/^(#{1,4})\s+(.+)$/gm, (match, hashes, text) => {
            const level = hashes.length;
            const slug = this.generateSlug(text);
            return `<h${level} id="${slug}">${this.escapeHtml(text)}</h${level}>`;
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
        
        // Restore TOC
        if (hasToc) {
            html = html.replace(this.tocPlaceholder, tocHtml);
        }
        
        // Convert double line breaks to paragraphs
        const lines = html.split('\n\n');
        html = lines.map(block => {
            block = block.trim();
            if (block === '') return '';
            
            // Don't wrap block elements or standalone code placeholders
            if (block.match(/^<(h[1-6]|ul|ol|table|pre|blockquote|div|nav|hr)/) ||
                block.startsWith(this.codeBlockPrefix)) {
                return block;
            }
            
            // Convert single line breaks to <br> tags for proper HTML display
            block = block.replace(/\n/g, '<br>');
            
            return '<p>' + block + '</p>';
        }).join('\n');

        // Restore code blocks after paragraph formatting so their whitespace is preserved
        codeBlocks.forEach((block, index) => {
            const placeholder = `${this.codeBlockPrefix}${index}${this.codeBlockSuffix}`;
            html = html.replace(placeholder, block);
        });
        
        return html;
    }
}

// Make it globally available
window.MarkdownParser = MarkdownParser;
