let currentConversation = null;
let draggedItem = null;
let openDropdown = null;
let isResponding = false;

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