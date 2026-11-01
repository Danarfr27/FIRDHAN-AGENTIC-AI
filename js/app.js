// ============================================
// FIRDHAN-AGENT-V1.0 - Main Application
// ============================================

class FirdhanAgent {
    constructor() {
        // State
        this.conversationHistory = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];
        this.currentFile = null;
        this.currentFileData = null;

        // DOM Elements
        this.chatContainer = document.getElementById('chatContainer');
        this.userInput = document.getElementById('userInput');
        this.sendBtn = document.querySelector('.send-btn');
        this.uploadBtn = document.querySelector('.upload-btn');
        this.fileInput = document.getElementById('fileInput');
        this.previewArea = document.getElementById('previewArea');
        this.previewContent = document.getElementById('previewContent');
        this.dragOverlay = document.getElementById('dragOverlay');
        this.modelSelect = document.getElementById('modelSelect');
        this.activeModelLabel = document.getElementById('activeModelLabel');
        this.selectedModel = this.getSavedModel();

        // Initialize
        this.init();
    }

    init() {
        this.initModelPicker();
        this.bindEvents();
        this.userInput.focus();
        console.log(`${CONFIG.APP_NAME} v${CONFIG.APP_VERSION} initialized`);
    }

    bindEvents() {
        // Enter key
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // File input
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) this.handleFile(e.target.files[0]);
        });

        this.modelSelect.addEventListener('change', () => {
            this.selectedModel = this.modelSelect.value;
            localStorage.setItem('firdhan-agent-model', this.selectedModel);
            this.activeModelLabel.textContent = `MODEL: ${this.selectedModel.toUpperCase()}`;
        });

        // Drag & Drop
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dragOverlay.classList.add('active');
        });

        document.addEventListener('dragleave', (e) => {
            if (e.target === document.body) {
                this.dragOverlay.classList.remove('active');
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dragOverlay.classList.remove('active');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    getSavedModel() {
        const savedModel = localStorage.getItem('firdhan-agent-model');
        return SUMOPOD_MODELS.includes(savedModel)
            ? savedModel
            : 'gemini/gemini-3.5-flash-lite';
    }

    initModelPicker() {
        this.modelSelect.replaceChildren(...SUMOPOD_MODELS.map(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            return option;
        }));
        this.modelSelect.value = this.selectedModel;
        this.activeModelLabel.textContent = `MODEL: ${this.selectedModel.toUpperCase()}`;
    }

    // ============================================
    // File Handling
    // ============================================

    handleFile(file) {
        // Validate file type
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        const isValidType = CONFIG.ALLOWED_FILE_TYPES.includes(file.type) || 
                           CONFIG.ALLOWED_EXTENSIONS.includes(fileExtension);

        if (!isValidType) {
            this.addSystemMessage('⚠️ FILE TYPE NOT SUPPORTED. Gunakan: JPG, PNG, GIF, WebP, PDF, TXT');
            return;
        }

        // Validate file size
        if (file.size > CONFIG.MAX_FILE_SIZE) {
            this.addSystemMessage('⚠️ FILE TOO LARGE. Maksimal 10MB.');
            return;
        }

        this.currentFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentFileData = e.target.result;
            this.showPreview(file, e.target.result);
        };

        if (file.type.startsWith('image/')) {
            reader.readAsDataURL(file);
        } else {
            reader.readAsText(file);
        }
    }

    showPreview(file, data) {
        this.previewArea.classList.add('active');

        const fileSize = this.formatFileSize(file.size);
        const isImage = file.type.startsWith('image/');

        let previewHTML = '';

        if (isImage) {
            previewHTML = `
                <img src="${data}" class="preview-image" alt="Preview">
                <div class="preview-info">
                    <div class="preview-filename">📷 ${file.name}</div>
                    <div class="preview-filesize">${fileSize}</div>
                    <div style="margin-top: 10px; color: var(--success); font-size: 0.85rem;">
                        ✓ Ready for OCR & Analysis
                    </div>
                </div>
            `;
        } else {
            previewHTML = `
                <div style="font-size: 3rem;">📄</div>
                <div class="preview-info">
                    <div class="preview-filename">${file.name}</div>
                    <div class="preview-filesize">${fileSize}</div>
                    <div style="margin-top: 10px; color: var(--success); font-size: 0.85rem;">
                        ✓ Document ready
                    </div>
                </div>
            `;
        }

        this.previewContent.innerHTML = previewHTML;
    }

    removeFile() {
        this.currentFile = null;
        this.currentFileData = null;
        this.fileInput.value = '';
        this.previewArea.classList.remove('active');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ============================================
    // Message Sending
    // ============================================

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message && !this.currentFile) return;

        // Disable inputs
        this.setInputsDisabled(true);

        let userMessageContent = message || '(File upload)';
        let fileInfo = '';

        // Handle file upload
        if (this.currentFile) {
            const isImage = this.currentFile.type.startsWith('image/');

            if (isImage) {
                this.addMessageWithImage('user', userMessageContent, this.currentFileData, this.currentFile.name);

                // Perform OCR
                this.addSystemMessage('🔍 OCR PROCESSING...');
                this.showOCRProgress();

                try {
                    const ocrResult = await this.performOCR(this.currentFileData);
                    this.hideOCRProgress();

                    if (ocrResult && ocrResult.trim()) {
                        this.addOCRResult(ocrResult);
                        fileInfo = `\n\n[OCR RESULT]:\n${ocrResult}`;
                    } else {
                        this.addSystemMessage('⚠️ No text detected in image');
                        fileInfo = '\n\n[IMAGE UPLOADED - No text detected]';
                    }
                } catch (error) {
                    this.hideOCRProgress();
                    this.addSystemMessage(`⚠️ OCR Error: ${error.message}`);
                    fileInfo = '\n\n[IMAGE UPLOADED - OCR failed]';
                }
            } else {
                this.addMessageWithFile('user', userMessageContent, this.currentFile.name, this.currentFileData);
                fileInfo = `\n\n[FILE CONTENT]:\n${this.currentFileData}`;
            }
        } else {
            this.addMessage('user', userMessageContent);
        }

        this.userInput.value = '';

        // Add to history
        this.conversationHistory.push({ 
            role: 'user', 
            content: userMessageContent + fileInfo 
        });

        // Show typing
        this.showTyping();

        try {
            let botResponse = '';
            let responseMessage = null;
            await this.callAPI((chunk) => {
                botResponse += chunk;
                this.removeTyping();

                if (!responseMessage) {
                    this.addMessage('bot', '');
                    responseMessage = this.chatContainer.lastElementChild;
                }

                const messageText = responseMessage.querySelector('.message-text');
                messageText.innerHTML = this.formatText(this.escapeHtml(botResponse));
                this.scrollToBottom();
            }, this.selectedModel);
            this.conversationHistory.push({ role: 'assistant', content: botResponse });

        } catch (error) {
            this.removeTyping();
            this.addMessage('bot', `⚠️ SYSTEM ERROR: ${error.message}. Silakan coba lagi, Pilot.`);
            console.error('Error:', error);
        } finally {
            this.setInputsDisabled(false);
            this.userInput.focus();
            this.removeFile();
        }
    }

    async callAPI(onChunk, model) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: this.conversationHistory, model })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.error || `HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('Browser tidak mendukung streaming respons');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        let done = false;

        const processEvent = (event) => {
            const data = event
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trim())
                .join('\n');

            if (!data || data === '[DONE]') return;

            const chunk = JSON.parse(data).choices?.[0]?.delta?.content;
            if (typeof chunk === 'string' && chunk) {
                fullResponse += chunk;
                onChunk(chunk);
            }
        };

        try {
            while (!done) {
                const result = await reader.read();
                done = result.done;
                buffer += decoder.decode(result.value || new Uint8Array(), { stream: !done });

                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() || '';
                events.forEach(processEvent);
            }
        } finally {
            reader.releaseLock();
        }

        if (buffer.trim()) processEvent(buffer);
        if (!fullResponse) throw new Error('OpenRouter tidak mengirim teks jawaban');
        return fullResponse;
    }

    setInputsDisabled(disabled) {
        this.userInput.disabled = disabled;
        this.sendBtn.disabled = disabled;
        this.uploadBtn.disabled = disabled;
    }

    // ============================================
    // OCR
    // ============================================

    async performOCR(imageData) {
        try {
            const result = await Tesseract.recognize(
                imageData,
                CONFIG.OCR_LANGUAGES,
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            this.updateOCRProgress(Math.round(m.progress * 100));
                        }
                    }
                }
            );
            return result.data.text;
        } catch (error) {
            throw new Error('OCR processing failed');
        }
    }

    showOCRProgress() {
        const progressDiv = document.createElement('div');
        progressDiv.id = 'ocrProgress';
        progressDiv.className = 'message system';
        progressDiv.innerHTML = `
            <div class="message-content" style="min-width: 300px;">
                <div class="message-header">🔍 OCR ENGINE</div>
                <div class="ocr-loading">
                    <div class="spinner"></div>
                    <span>Processing image...</span>
                </div>
                <div class="ocr-progress">
                    <div class="ocr-progress-bar" id="ocrProgressBar" style="width: 0%"></div>
                </div>
                <div id="ocrPercent" style="text-align: right; font-size: 0.8rem; color: var(--warning); margin-top: 5px;">0%</div>
            </div>
        `;
        this.chatContainer.appendChild(progressDiv);
        this.scrollToBottom();
    }

    updateOCRProgress(percent) {
        const bar = document.getElementById('ocrProgressBar');
        const percentText = document.getElementById('ocrPercent');
        if (bar) bar.style.width = percent + '%';
        if (percentText) percentText.textContent = percent + '%';
    }

    hideOCRProgress() {
        const progress = document.getElementById('ocrProgress');
        if (progress) progress.remove();
    }

    // ============================================
    // UI Rendering
    // ============================================

    addMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const header = role === 'user' ? '👤 PILOT' : '🤖 FIRDHAN-AGENT';

        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-header">${header}</div>
                <div class="message-text">${this.formatText(text)}</div>
            </div>
        `;

        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addMessageWithImage(role, text, imageData, filename) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-header">👤 PILOT</div>
                ${text ? `<div class="message-text">${this.formatText(text)}</div>` : ''}
                <img src="${imageData}" class="uploaded-image" alt="${filename}">
                <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 5px;">📷 ${filename}</div>
            </div>
        `;

        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addMessageWithFile(role, text, filename, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-header">👤 PILOT</div>
                ${text ? `<div class="message-text">${this.formatText(text)}</div>` : ''}
                <div class="uploaded-file">
                    <span class="file-icon">📄</span>
                    <div class="file-info">
                        <div class="file-name">${filename}</div>
                        <div class="file-size">Text Document</div>
                    </div>
                </div>
            </div>
        `;

        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-header">⚙️ SYSTEM</div>
                <div class="message-text">${text}</div>
            </div>
        `;
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addOCRResult(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.innerHTML = `
            <div class="message-content" style="min-width: 300px;">
                <div class="message-header">📋 OCR RESULT</div>
                <div class="ocr-result">
                    <div class="ocr-header">
                        <span>✓</span>
                        <span>Text Extracted Successfully</span>
                    </div>
                    <div class="ocr-text">${this.escapeHtml(text)}</div>
                </div>
            </div>
        `;
        this.chatContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot';
        typingDiv.id = 'typing';
        typingDiv.innerHTML = `
            <div class="typing">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        this.chatContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    removeTyping() {
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // ============================================
    // Utilities
    // ============================================

    formatText(text) {
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:rgba(0,240,255,0.1);padding:2px 6px;border-radius:3px;">$1</code>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// Initialize App
// ============================================

// Global functions for HTML onclick
let app;

function sendMessage() {
    if (app) app.sendMessage();
}

function removeFile() {
    if (app) app.removeFile();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    app = new FirdhanAgent();
});
