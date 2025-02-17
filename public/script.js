let currentConversation = null;
let draggedItem = null;
let openDropdown = null;
let isResponding = false;
let currentTab = 'conversations';
let activeVaultFile = null;

async function sendMessage() {
    if (isResponding) return;
    
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    addMessage('user', message);
    
    try {
        isResponding = true;
        showLoadingState();
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        hideLoadingState();
        addTypewriterMessage(data.response);
        refreshConversations();
    } catch (error) {
        hideLoadingState();
        alert(`Error: ${error.message}`);
    } finally {
        isResponding = false;
    }
}

function showLoadingState() {
    const history = document.getElementById('chat-history');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
    `;
    history.appendChild(loadingDiv);
    history.scrollTop = history.scrollHeight;
}

function hideLoadingState() {
    const loadingElements = document.querySelectorAll('.loading-spinner');
    loadingElements.forEach(el => el.parentElement.remove());
}
function addTypewriterMessage(content) {
    const history = document.getElementById('chat-history');
    
    // Create container elements
    const messageDiv = document.createElement('div');
    const contentDiv = document.createElement('div');
    const cursor = document.createElement('span');
    
    messageDiv.className = 'message assistant';
    contentDiv.className = 'message-content';
    cursor.className = 'typing-cursor';
    
    // Set initial state
    messageDiv.style.height = 'auto';
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(cursor);
    history.appendChild(messageDiv);
    
    // Store current render position
    let index = 0;
    let currentHeight = 0;
    let prevText = '';
    
    function typeWriter() {
        if (index < content.length) {
            // Add next character
            contentDiv.textContent = content.substring(0, index + 1);
            cursor.style.display = 'inline-block';
            
            // Check height changes
            const newHeight = contentDiv.scrollHeight;
            if (newHeight > currentHeight) {
                messageDiv.style.height = `${newHeight}px`;
                currentHeight = newHeight;
            }
            
            index++;
            history.scrollTop = history.scrollHeight;
            setTimeout(typeWriter, 30);
        } else {
            cursor.style.display = 'none';
            messageDiv.style.height = 'auto';
        }
    }
    
    // Start animation
    typeWriter();
}

// Update existing addMessage to prevent typewriter on history load
function addMessage(role, content) {
    const history = document.getElementById('chat-history');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.textContent = content;
    history.appendChild(messageDiv);
    history.scrollTop = history.scrollHeight;
}

// Update refreshConversations function
async function refreshConversations() {
    const response = await fetch('/api/conversations');
    const conversations = await response.json();
    const list = document.getElementById('conversation-list');
    
    list.innerHTML = conversations.map(conv => `
        <div class="conversation-item${currentConversation === conv.id ? ' active' : ''}" 
            data-id="${conv.id}"
            draggable="true"
            ondragstart="dragStart(event)"
            ondragover="dragOver(event)"
            ondragend="dragEnd(event)">
            <div class="conversation-header">
                <span class="conversation-title" onclick="loadConversation('${conv.id}')">${conv.title}</span>
                <div class="dropdown">
                    <button class="dropdown-btn" onclick="toggleDropdown(event, '${conv.id}')">⋮</button>
                    <div class="dropdown-content" id="dropdown-${conv.id}">
                        <button onclick="renameConversation('${conv.id}')">Rename</button>
                        <button onclick="deleteConversation('${conv.id}')">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Add these new functions
function toggleDropdown(event, conversationId) {
    event.stopPropagation();
    const dropdown = document.getElementById(`dropdown-${conversationId}`);
    
    if (openDropdown && openDropdown !== dropdown) {
        openDropdown.classList.remove('show');
    }
    
    dropdown.classList.toggle('show');
    openDropdown = dropdown.classList.contains('show') ? dropdown : null;
}
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-content').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    openDropdown = null;
}

// Add click listener to close dropdowns
document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) {
        closeAllDropdowns();
    }
});

// Update loadConversation function
// Update loadConversation function
async function loadConversation(conversationId) {
    try {
        closeAllDropdowns();
        currentConversation = conversationId;
        const history = document.getElementById('chat-history');
        history.innerHTML = '';
        
        const response = await fetch(`/conversations/${conversationId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const content = await response.text();
        const sections = content.split('\n## ').slice(1);
        
        sections.forEach(section => {
            const [rolePart, ...contentParts] = section.split('\n');
            const role = rolePart.startsWith('User') ? 'user' : 'assistant';
            const content = contentParts.join('\n').trim();
            
            if (content) {
                addMessage(role, content);
            }
        });
        
        refreshConversations();
    } catch (error) {
        alert(`Error loading conversation: ${error.message}`);
    }
}

// Update newChat function
async function newChat() {
    try {
        await fetch('/api/new-chat', { method: 'POST' });
        document.getElementById('chat-history').innerHTML = '';
        currentConversation = null;
        refreshConversations();
    } catch (error) {
        alert('Error starting new chat');
    }
}
async function deleteConversation(id) {
    if (!confirm('Delete this conversation permanently?')) return;
    try {
        await fetch(`/api/conversation/${id}`, { method: 'DELETE' });
        refreshConversations();
        if (currentConversation === id) {
            document.getElementById('chat-history').innerHTML = '';
        }
    } catch (error) {
        alert('Error deleting conversation');
    }
}

async function renameConversation(id) {
    const newTitle = prompt('Enter new conversation title:');
    if (newTitle) {
        try {
            await fetch(`/api/conversation/${id}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newTitle })
            });
            refreshConversations();
        } catch (error) {
            alert('Error renaming conversation');
        }
    }
}

// Drag and Drop functions
function dragStart(e) {
    draggedItem = e.target;
    e.target.classList.add('dragging');
}

function dragOver(e) {
    e.preventDefault();
    const list = document.getElementById('conversation-list');
    const afterElement = [...list.children].find(child => 
        e.clientY < child.getBoundingClientRect().top + child.offsetHeight / 2
    );
    if (afterElement) {
        list.insertBefore(draggedItem, afterElement);
    }
}

function dragEnd(e) {
    e.target.classList.remove('dragging');
    // Here you would typically save the new order to the server
}



// Event listeners
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Initial load
refreshConversations();

// Tab click handlers
document.getElementById('tab-conversations').addEventListener('click', () => {
    currentTab = 'conversations';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-conversations').classList.add('active');
    document.getElementById('new-chat-btn').style.display = 'inline-block';
    document.getElementById('vault-new-file').style.display = 'none';
    document.getElementById('vault-new-folder').style.display = 'none';
    refreshConversations();
});

document.getElementById('tab-vault').addEventListener('click', () => {
    currentTab = 'vault';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-vault').classList.add('active');
    document.getElementById('new-chat-btn').style.display = 'none';
    document.getElementById('vault-new-file').style.display = 'inline-block';
    document.getElementById('vault-new-folder').style.display = 'inline-block';
    showVaultStructure();
});

// Vault functionality
async function showVaultStructure() {
    try {
        const response = await fetch('/api/vault-structure');
        if (!response.ok) throw new Error('Failed to load vault');
        const vaultData = await response.json();
        renderVaultTree(vaultData, document.getElementById('conversation-list'));
        
        // Retry selection with timeout
        if (activeVaultFile) {
            let retries = 3;
            const trySelect = () => {
                const activeItem = document.querySelector(`[data-path="${activeVaultFile}"]`);
                if (activeItem) {
                    activeItem.click();
                } else if (retries-- > 0) {
                    setTimeout(trySelect, 100);
                }
            };
            trySelect();
        }
    } catch (err) {
        alert('Error loading vault: ' + err.message);
    }
}

function renderVaultTree(entries, container, depth = 0) {
    container.innerHTML = '';
    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'vault-item';
        item.style.paddingLeft = `${depth * 15}px`;

        item.setAttribute('data-path', entry.path);

        if (entry.type === 'directory') {
            item.innerHTML = `<span class="vault-folder-name">📁 ${entry.name}</span>`;
            const childrenContainer = document.createElement('div');
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.vault-folder-name')) return;
                childrenContainer.hidden = !childrenContainer.hidden;
            });
            container.appendChild(item);
            container.appendChild(childrenContainer);
            if (entry.children) {
                renderVaultTree(entry.children, childrenContainer, depth + 1);
            }
        } else {
            item.innerHTML = `<span class="vault-file-name">📄 ${entry.name}</span>`;
            item.addEventListener('click', () => loadVaultFile(entry.path));
            container.appendChild(item);
        }

        // Add context menu
        const contextDiv = document.createElement('div');
        contextDiv.className = 'vault-context-menu';
        contextDiv.innerHTML = `
            <div class="vault-context-btn"></div>
            <div class="dropdown-content vault-dropdown" style="display: none;">
                <button class="rename-vault-item">Rename</button>
                <button class="delete-vault-item">Delete</button>
                <button class="move-vault-item">Move</button>
            </div>
        `;
        
        item.appendChild(contextDiv);
        
        // Add click handlers
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.vault-context-menu')) {
                document.querySelectorAll('.vault-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                if (entry.type === 'file') loadVaultFile(entry.path);
            }
        });

        // Context menu handlers
        contextDiv.querySelector('.rename-vault-item').addEventListener('click', () => 
            renameVaultItem(entry));
        contextDiv.querySelector('.delete-vault-item').addEventListener('click', () => 
            deleteVaultItem(entry));
        contextDiv.querySelector('.move-vault-item').addEventListener('click', () => 
            moveVaultItem(entry));

        // Add click handler for the context button
        contextDiv.querySelector('.vault-context-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = contextDiv.querySelector('.vault-dropdown');
            const allDropdowns = document.querySelectorAll('.vault-dropdown');
            allDropdowns.forEach(d => d.style.display = 'none');
            dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });
    });
}

async function loadVaultFile(path) {
    // Add cache busting parameter
    const response = await fetch(`/api/vault-file?path=${encodeURIComponent(path)}&_=${Date.now()}`);
    console.log('[DEBUG] Response status:', response.status);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
    }
    const content = await response.text();
    console.log('[DEBUG] File content received:', content.substring(0, 50) + '...');
    const htmlContent = marked.parse(content);
    document.getElementById('chat-history').innerHTML = 
        `<div class="vault-file-content">${htmlContent}</div>`;
}

// Add event listeners for vault buttons
document.getElementById('vault-new-file').addEventListener('click', async () => {
    const fileName = prompt('Enter new file name (e.g. "notes.md"):');
    if (fileName) {
        await fetch('/api/vault-new-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: fileName })
        });
        showVaultStructure();
    }
});

document.getElementById('vault-new-folder').addEventListener('click', async () => {
    const folderName = prompt('Enter new folder name:');
    if (folderName) {
        await fetch('/api/vault-new-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: folderName })
        });
        showVaultStructure();
    }
});

// Drag and drop implementation
let draggedVaultItem = null;

document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.vault-item')) {
        draggedVaultItem = e.target.closest('.vault-item');
    }
});

document.addEventListener('dragover', (e) => {
    if (draggedVaultItem && e.target.closest('.vault-folder-name')) {
        e.preventDefault();
        e.target.style.backgroundColor = '#f8f9fa';
    }
});

document.addEventListener('drop', async (e) => {
    if (draggedVaultItem && e.target.closest('.vault-folder-name')) {
        e.preventDefault();
        const targetPath = e.target.closest('[data-path]').dataset.path;
        await moveVaultItem({
            path: draggedVaultItem.dataset.path,
            newPath: path.join(targetPath, draggedVaultItem.dataset.name)
        });
    }
});

// Vault item operations
async function renameVaultItem(item) {
    const newName = prompt('Enter new name:', item.name);
    if (newName) {
        try {
            // 1. Atomic path construction
            const newPath = item.path.replace(/[^/]+$/, newName);
            
            // 2. Immediate state update
            const wasActive = activeVaultFile === item.path;
            if (wasActive) activeVaultFile = newPath;
            
            // 3. Server call with error rollback
            const response = await fetch('/api/vault-rename', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    oldPath: item.path,
                    newName: newPath
                })
            });
            
            if (!response.ok) {
                if (wasActive) activeVaultFile = item.path; // Rollback
                throw new Error('Rename failed');
            }
            
            // 5. Force-clear old DOM references FIRST
            document.querySelectorAll(`[data-path="${item.path}"]`)
                   .forEach(el => el.remove());
            
            // 6. Batch UI update BEFORE loading
            await showVaultStructure();

            // 4. Now safe to load after DOM refresh
            if (wasActive) await loadVaultFile(newPath);

        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    }
}

async function deleteVaultItem(item) {
    if (confirm(`Delete ${item.name} permanently?`)) {
        await fetch(`/api/vault-delete/${encodeURIComponent(item.path)}`, {
            method: 'DELETE'
        });
        showVaultStructure();
    }
}

async function moveVaultItem(item) {
    const newPath = prompt('Enter new path:', 
        item.path.includes('/') 
            ? item.path.split('/').slice(0, -1).join('/')
            : '');
    if (newPath) {
        await fetch(`/api/vault-move/${encodeURIComponent(item.path)}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({newPath})
        });
        showVaultStructure();
    }
}

// Add click handler to close dropdowns
document.addEventListener('click', (e) => {
    if (!e.target.closest('.vault-context-menu')) {
        document.querySelectorAll('.vault-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    }
});