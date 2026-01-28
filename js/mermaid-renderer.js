// Simple Mermaid Renderer
// Uses Mermaid from CDN or provides fallback

class MermaidRenderer {
    constructor() {
        this.mermaidLoaded = false;
        this.loadMermaid();
    }
    
    async loadMermaid() {
        try {
            // Try to load Mermaid from CDN
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = `
                import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
                mermaid.initialize({ startOnLoad: false, theme: 'default' });
                window.mermaid = mermaid;
                window.dispatchEvent(new Event('mermaid-loaded'));
            `;
            document.head.appendChild(script);
            
            // Wait for mermaid to load
            await new Promise((resolve, reject) => {
                window.addEventListener('mermaid-loaded', resolve);
                setTimeout(() => reject(new Error('Mermaid load timeout')), 5000);
            });
            
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
        
        // Wait a bit for mermaid to load
        for (let i = 0; i < 10 && !window.mermaid; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        if (window.mermaid) {
            try {
                await window.mermaid.run({
                    querySelector: '.mermaid'
                });
            } catch (error) {
                console.error('Error rendering mermaid diagrams:', error);
                this.renderFallback();
            }
        } else {
            this.renderFallback();
        }
    }
    
    renderFallback() {
        const mermaidContainers = document.querySelectorAll('.mermaid-container');
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
