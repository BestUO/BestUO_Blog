// Simple Mermaid Renderer
// Uses Mermaid from CDN or provides fallback

class MermaidRenderer {
    constructor() {
        this.mermaidLoaded = false;
        this.mermaidLoadPromise = this.loadMermaid();
    }
    
    async loadMermaid() {
        try {
            // Try to load Mermaid from CDN
            const mermaidLoaded = new Promise((resolve, reject) => {
                window.addEventListener('mermaid-loaded', resolve, { once: true });
                setTimeout(() => reject(new Error('Mermaid load timeout')), 5000);
            });
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({ startOnLoad: false, theme: 'default' });
                window.mermaid = mermaid;
                window.dispatchEvent(new Event('mermaid-loaded'));
            `;
            document.head.appendChild(script);
            await mermaidLoaded;
            
            this.mermaidLoaded = true;
        } catch (error) {
            console.warn('Mermaid CDN failed to load, using fallback', error);
            this.mermaidLoaded = false;
        }
    }
    
    async render() {
        const mermaidContainers = document.querySelectorAll('.mermaid-container');
        
        if (mermaidContainers.length === 0) {
            return;
        }
        
        // Unescape HTML entities in mermaid blocks for rendering
        mermaidContainers.forEach(container => {
            const mermaidDiv = container.querySelector('.mermaid');
            if (mermaidDiv) {
                const textarea = document.createElement('textarea');
                textarea.innerHTML = mermaidDiv.textContent;
                mermaidDiv.textContent = textarea.value;
            }
        });
        
        try {
            await this.mermaidLoadPromise;
        } catch (error) {
            this.renderFallback();
            return;
        }

        if (window.mermaid) {
            for (const [index, container] of mermaidContainers.entries()) {
                const mermaidDiv = container.querySelector('.mermaid');
                if (!mermaidDiv) {
                    continue;
                }

                try {
                    const code = mermaidDiv.textContent;
                    let result;
                    try {
                        result = await window.mermaid.render(
                            `mermaid-diagram-${Date.now()}-${index}`,
                            code
                        );
                    } catch (error) {
                        result = await window.mermaid.render(`mermaid-diagram-retry-${index}`, code);
                    }
                    const { svg, bindFunctions } = result;
                    mermaidDiv.innerHTML = svg;
                    bindFunctions?.(mermaidDiv);
                } catch (error) {
                    console.error('Error rendering mermaid diagram:', error);
                    this.renderFallback(container);
                }
            }
        } else {
            this.renderFallback();
        }
    }
    
    renderFallback(container) {
        const mermaidContainers = container
            ? [container]
            : document.querySelectorAll('.mermaid-container');
        mermaidContainers.forEach(container => {
            const code = container.querySelector('.mermaid').textContent;
            container.innerHTML = `
                <div class="mermaid-fallback">
                    <p><em>Mermaid diagram:</em></p>
                    <pre><code>${this.escapeHtml(code)}</code></pre>
                </div>
            `;
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.MermaidRenderer = MermaidRenderer;
