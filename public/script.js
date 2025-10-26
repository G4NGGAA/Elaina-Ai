document.addEventListener('DOMContentLoaded', () => {
    // --- 1. DOM Elements (Semua Variabel Elemen di Sini) ---
    const customConfirm = document.getElementById('custom-confirm');
    const modalOverlay = document.getElementById('modal-overlay');
    const confirmNo = document.getElementById('confirm-no');
    const chatContainer = document.getElementById('chat-container');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const menuBtn = document.getElementById('menu-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const sidebarLeft = document.getElementById('sidebar-left');
    const sidebarRight = document.getElementById('sidebar-right');
    const overlay = document.getElementById('overlay');
    const newChatBtn = document.getElementById('new-chat-btn');
    const historyList = document.getElementById('history-list');
    const fileInput = document.getElementById('file-input');
    const filePreviewContainer = document.getElementById('file-preview-container');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const welcomeScreen = document.getElementById('welcome-screen');
    const uploadFileBtn = document.getElementById('upload-file-btn');
    const sendButton = document.getElementById('send-button');

    const modelSelect = document.getElementById('model-select');
    const systemInstruction = document.getElementById('system-instruction');
    const groundingToggle = document.getElementById('grounding-toggle');
    const darkThemeToggle = document.getElementById('dark-theme-toggle');

    // --- 2. State dan Global Variables ---
    let chatHistory = [],
        currentChatId = null,
        attachedFiles = [],
        abortController = null;
    
    // Konfigurasi Marked (Markdown parser)
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    // --- 3. Utility Functions ---

    /** Fungsi-fungsi untuk Modal Konfirmasi */
    // HANYA UNTUK DEMO: Menghapus class 'active' agar modal tidak tampil secara default
    if (customConfirm && modalOverlay) {
        customConfirm.classList.remove('active');
        modalOverlay.classList.remove('active');
    }

    const closeModal = () => {
        if (customConfirm && modalOverlay) {
            customConfirm.classList.remove('active');
            modalOverlay.classList.remove('active');
        }
    };
    
    /** Fungsi-fungsi Navigasi & UI */
    const scrollToBottom = () => chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
    const closeAllSidebars = () => {
        sidebarLeft.classList.remove('open');
        sidebarRight.classList.remove('open');
        overlay.classList.remove('active');
    };
    const toggleSidebarLeft = () => {
        if (sidebarRight.classList.contains('open')) sidebarRight.classList.remove('open');
        sidebarLeft.classList.toggle('open');
        overlay.classList.toggle('active', sidebarLeft.classList.contains('open'));
    };
    const toggleSidebarRight = () => {
        if (sidebarLeft.classList.contains('open')) sidebarLeft.classList.remove('open');
        sidebarRight.classList.toggle('open');
        overlay.classList.toggle('active', sidebarRight.classList.contains('open'));
    };
    const applyTheme = (isDark) => {
        document.body.classList.toggle('dark-theme', isDark);
    };

    /** Fungsi-fungsi Pengaturan (Settings) */
    const saveSettings = () => {
        const settings = {
            model: modelSelect.value,
            systemInstruction: systemInstruction.value,
            grounding: groundingToggle.checked,
            darkTheme: darkThemeToggle.checked
        };
        localStorage.setItem('elaina-chan-settings', JSON.stringify(settings));
    };

    const loadSettings = () => {
        const savedSettings = JSON.parse(localStorage.getItem('elaina-chan-settings'));
        const defaultInstruction = "Kamu adalah asisten AI bernama Elaina Chan. Kamu sangat baik hati, imut, dan selalu ceria. Gaya bicaramu santai dan ramah. Jika menjawab pertanyaan detail, berikan jawaban yang terstruktur dengan baik, tapi kalau hanya ngobrol biasa, jawab dengan singkat dan lucu yaa~";
        
        if (savedSettings) {
            modelSelect.value = savedSettings.model || 'gemini-2.0-flash';
            systemInstruction.value = savedSettings.systemInstruction || defaultInstruction;
            groundingToggle.checked = savedSettings.grounding || false;
            darkThemeToggle.checked = savedSettings.darkTheme || false;
        } else {
            systemInstruction.value = defaultInstruction;
        }
        
        applyTheme(darkThemeToggle.checked);
        return {
            model: modelSelect.value,
            systemInstruction: systemInstruction.value,
            grounding: groundingToggle.checked
        };
    };

    /** Fungsi-fungsi Chat History (Penyimpanan Lokal) */
    const getChats = () => JSON.parse(localStorage.getItem('elaina-chan-chats')) || {};
    const saveChats = (chats) => localStorage.setItem('elaina-chan-chats', JSON.stringify(chats));
    
    const saveChatToStorage = () => {
        if (!currentChatId || chatHistory.length === 0) return;
        const chats = getChats();
        const firstUserMessage = chatHistory.find(m => m.role === 'user');
        // Ambil 30 karakter pertama dari pesan user atau default
        const title = firstUserMessage ? firstUserMessage.parts.find(p => p.text)?.text?.substring(0, 30) : "Chat dengan File";
        chats[currentChatId] = {
            id: currentChatId,
            title,
            messages: chatHistory
        };
        saveChats(chats);
    };

    const renderHistoryList = () => {
        historyList.innerHTML = '';
        Object.values(getChats()).sort((a, b) => b.id - a.id).forEach(chat => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.dataset.chatId = chat.id;
            li.innerHTML = `<span class="history-item-title">${chat.title}</span>`;
            historyList.appendChild(li);
        });
    };

    const loadChat = (chatId) => {
        const chat = getChats()[chatId];
        if (!chat) return;
        currentChatId = chatId;
        chatHistory = chat.messages;
        chatContainer.innerHTML = '';
        chatHistory.forEach(msg => addMessageToUI(msg));
        closeAllSidebars();
    };

    const startNewChat = () => {
        currentChatId = null;
        chatHistory = [];
        resetFileInput();
        chatContainer.innerHTML = '';
        chatContainer.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'flex';
        localStorage.removeItem('elaina-active-chat-id');
        closeAllSidebars();
        renderHistoryList(); // Render ulang setelah chat baru dimulai
    };

    const loadLatestChat = () => {
        const latestChatId = localStorage.getItem('elaina-active-chat-id');
        const chats = getChats();
        if (latestChatId && chats[latestChatId]) {
            loadChat(latestChatId);
        } else {
            startNewChat();
        }
    };

    /** Fungsi-fungsi Chat Message dan UI */
    const decodeHTMLEntities = (text) => {
        const ta = document.createElement('textarea');
        ta.innerHTML = text;
        return ta.value;
    };

    const addCitations = (text, groundingMetadata) => {
        if (!text || !groundingMetadata?.groundingSupports?.length) return text;
        try {
            const supports = [...groundingMetadata.groundingSupports].sort((a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0));
            let processedText = text;
            
            for (const support of supports) {
                const endIndex = support.segment?.endIndex;
                if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;
                
                const citationLinks = support.groundingChunkIndices
                    .map(i => `<sup class="citation-link"><a href="${groundingMetadata.groundingChunks[i]?.web?.uri}" target="_blank">${i + 1}</a></sup>`)
                    .join('');
                
                if (citationLinks) {
                    // Tambahkan spasi sebelum sitasi agar tidak menempel pada kata terakhir
                    processedText = processedText.slice(0, endIndex) + ' ' + citationLinks + processedText.slice(endIndex);
                }
            }
            return processedText;
        } catch (e) {
            console.error("Error processing citations:", e);
            return text;
        }
    };

    const addMessageToUI = (msg, fullResponse = null) => {
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${msg.role === 'user' ? 'user' : 'ai'}`;
        wrapper.dataset.id = msg.id;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';

        let contentHTML = '';
        msg.parts.forEach(part => {
            if (part.file) {
                contentHTML += part.file.mimeType.startsWith('image/') ?
                    `<img src="${part.file.data}" class="chat-file-image">` :
                    `<div class="chat-file-info"><span>${part.file.name}</span></div>`;
            }
            
            if (part.text) {
                let textToParse = decodeHTMLEntities(part.text);
                
                if (msg.role === 'model' && fullResponse) {
                    textToParse = addCitations(textToParse, fullResponse.groundingMetadata);
                }
                
                contentHTML += marked.parse(textToParse);
            }
        });
        
        contentDiv.innerHTML = contentHTML;
        wrapper.appendChild(contentDiv);

        if (welcomeScreen?.style.display !== 'none') welcomeScreen.style.display = 'none';
        chatContainer.appendChild(wrapper);

        // Menambahkan header dan tombol untuk code block
        contentDiv.querySelectorAll('pre > code').forEach(codeElement => {
            const preElement = codeElement.parentElement;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-block-header';
            const lang = (codeElement.className.match(/language-(\S+)/) || [])[1] || 'text';
            header.innerHTML = `<span class="code-block-lang">${lang}</span>
                <div class="code-block-actions">
                    <button class="icon-button copy-btn" title="Copy code"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="icon-button download-btn" title="Download file"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
                </div>`;

            wrapper.appendChild(header);
            preElement.parentNode.insertBefore(wrapper, preElement);
            wrapper.appendChild(preElement);

            // Listener untuk tombol Copy
            header.querySelector('.copy-btn').addEventListener('click', (e) => {
                navigator.clipboard.writeText(codeElement.innerText);
                const button = e.currentTarget;
                const originalContent = button.innerHTML;
                button.innerHTML = 'Copied!';
                setTimeout(() => button.innerHTML = originalContent, 1500);
            });
            
            // Listener untuk tombol Download
            header.querySelector('.download-btn').addEventListener('click', () => {
                const exts = {
                    'javascript': 'js',
                    'python': 'py',
                    'html': 'html',
                    'css': 'css',
                    'typescript': 'ts',
                    'json': 'json',
                    'markdown': 'md',
                    'text': 'txt'
                };
                const blob = new Blob([codeElement.innerText], {
                    type: 'text/plain'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `code.${exts[lang] || 'txt'}`;
                a.click();
                URL.revokeObjectURL(url);
            });
        });

        scrollToBottom();
    };

    const showThinkingIndicator = () => {
        if (document.querySelector('.thinking-indicator')) return;
        const indicator = document.createElement('div');
        indicator.className = 'message-wrapper ai thinking-indicator';
        indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        if (welcomeScreen?.style.display !== 'none') welcomeScreen.style.display = 'none';
        chatContainer.appendChild(indicator);
        scrollToBottom();
    };

    const removeThinkingIndicator = () => document.querySelector('.thinking-indicator')?.remove();

    /** Fungsi-fungsi File Upload */
    const renderFilePreviews = () => {
        filePreviewContainer.innerHTML = '';
        filePreviewContainer.style.display = attachedFiles.length > 0 ? 'flex' : 'none';
        
        attachedFiles.forEach((file, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            
            if (file.mimeType.startsWith('image/')) {
                previewItem.innerHTML = `<img src="${file.data}" alt="Preview"><button class="remove-file-btn" data-index="${index}">&times;</button>`;
            } else {
                previewItem.innerHTML = `<div class="file-placeholder"><span>${file.name}</span></div><button class="remove-file-btn" data-index="${index}">&times;</button>`;
            }
            filePreviewContainer.appendChild(previewItem);
        });
        
        // Menambahkan listener untuk tombol hapus
        document.querySelectorAll('.remove-file-btn').forEach(btn => btn.addEventListener('click', (e) => {
            attachedFiles.splice(parseInt(e.target.dataset.index, 10), 1);
            renderFilePreviews();
        }));
    };

    const resetFileInput = () => {
        attachedFiles = [];
        renderFilePreviews();
    };

    /** Fungsi Utama Pengiriman Pesan */
    const processAndSendMessage = async () => {
        const userMessage = messageInput.value.trim();
        const userFiles = [...attachedFiles];
        if (!userMessage && userFiles.length === 0) return;

        abortController = new AbortController();
        const {
            signal
        } = abortController;

        const newUserMessage = {
            role: "user",
            parts: [],
            id: Date.now()
        };
        if (userMessage) newUserMessage.parts.push({
            text: userMessage
        });
        userFiles.forEach(file => newUserMessage.parts.push({
            file
        }));
        
        chatHistory.push(newUserMessage);
        addMessageToUI(newUserMessage);

        // Inisialisasi ID chat baru jika belum ada
        if (currentChatId === null) currentChatId = Date.now().toString();
        
        saveChatToStorage();
        renderHistoryList();

        messageInput.value = '';
        messageInput.style.height = 'auto'; // Reset tinggi textarea
        resetFileInput();
        
        document.body.classList.add('is-streaming'); // Untuk menonaktifkan tombol kirim/mengubah ikon
        showThinkingIndicator();

        try {
            const settings = loadSettings();
            const res = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    history: chatHistory.slice(0, -1), // Kirim history tanpa pesan terakhir (yang baru ditambahkan)
                    message: userMessage,
                    files: userFiles,
                    settings
                }),
                signal
            });

            removeThinkingIndicator();
            
            if (!res.ok) {
                // Mencoba membaca pesan error dari body response
                const errorData = await res.json();
                throw new Error(errorData.error || `Error ${res.status}: Kesalahan tidak diketahui.`);
            }

            const fullResponse = await res.json();
            const newAiMessage = {
                role: "model",
                parts: [{
                    text: fullResponse.text
                }],
                id: Date.now()
            };
            
            chatHistory.push(newAiMessage);
            saveChatToStorage();
            addMessageToUI(newAiMessage, fullResponse); // Kirim fullResponse untuk sitasi
        
        } catch (error) {
            removeThinkingIndicator();
            if (error.name !== 'AbortError') {
                const errorMsg = {
                    role: "model",
                    parts: [{
                        text: `Aww, maaf, Elaina error nih: ${error.message}`
                    }],
                    id: Date.now()
                };
                addMessageToUI(errorMsg);
            }
        } finally {
            document.body.classList.remove('is-streaming');
            abortController = null;
            messageInput.focus();
        }
    };

    // --- 4. Event Listeners ---

    // ** 4.1. Modal Konfirmasi **
    if (confirmNo) confirmNo.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    // ** 4.2. Navigasi Sidebar **
    menuBtn.addEventListener('click', toggleSidebarLeft);
    closeSidebarBtn.addEventListener('click', closeAllSidebars);
    settingsBtn.addEventListener('click', toggleSidebarRight);
    closeSettingsBtn.addEventListener('click', closeAllSidebars);
    overlay.addEventListener('click', closeAllSidebars);
    newChatBtn.addEventListener('click', startNewChat);

    // ** 4.3. Pengiriman Pesan & Input **
    sendButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.body.classList.contains('is-streaming')) {
            // Cancel streaming/response
            abortController?.abort();
        } else {
            // Kirim pesan
            processAndSendMessage();
        }
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // Cek apakah sedang streaming. Jika tidak, kirim pesan. Jika ya, biarkan tombol kirim menangani pembatalan.
        if (!document.body.classList.contains('is-streaming')) {
            processAndSendMessage();
        }
    });

    // Auto-resize textarea dan kirim dengan Enter
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
        }
    });

    messageInput.addEventListener('input', () => {
        // Auto-resize (hanya tinggi, batasi max 150px)
        messageInput.style.height = 'auto';
        messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
    });

    // ** 4.4. File Upload **
    uploadFileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        
        if (attachedFiles.length + files.length > 5) {
            alert("Maaf, kamu cuma bisa upload maksimal 5 file yaa.");
            fileInput.value = ''; // Reset input agar bisa upload lagi
            return;
        }

        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                attachedFiles.push({
                    data: reader.result,
                    mimeType: file.type,
                    name: file.name
                });
                renderFilePreviews();
            };
            reader.readAsDataURL(file);
        });

        fileInput.value = ''; // Reset input setelah memproses file
    });

    // ** 4.5. History & Settings **
    historyList.addEventListener('click', (e) => {
        const historyItem = e.target.closest('.history-item');
        if (historyItem) {
            loadChat(historyItem.dataset.chatId);
        }
    });

    // Listener untuk menyimpan settings
    [modelSelect, systemInstruction, groundingToggle, darkThemeToggle].forEach(el => el.addEventListener('change', saveSettings));
    systemInstruction.addEventListener('keyup', saveSettings);
    darkThemeToggle.addEventListener('change', () => applyTheme(darkThemeToggle.checked));

    // Listener untuk Suggestion Chips
    document.querySelectorAll('.suggestion-chips .chip').forEach(chip => chip.addEventListener('click', () => {
        messageInput.value = chip.textContent.trim();
        processAndSendMessage();
    }));

    // Menyimpan ID chat aktif sebelum menutup/me-refresh
    window.addEventListener('beforeunload', () => {
        if (currentChatId) {
            localStorage.setItem('elaina-active-chat-id', currentChatId);
        }
    });

    // --- 5. Initial Load ---
    loadSettings();
    renderHistoryList();
    loadLatestChat();
});
