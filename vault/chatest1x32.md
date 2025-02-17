**Detailed Plan for Adding a “Vault” Tab with File Viewing and Creation**

Below is a step-by-step guide describing how to add:
1. A **two-tab** interface in the existing left-hand sidebar (Conversations / Vault).  
2. A **Vault** explorer that shows folders and files on the left.  
3. A **File display pane** on the right where you can view or edit the selected file’s content.  
4. An option to **create new folders or files** in the Vault.

---

## 1. Add Tabs in the Left Sidebar

We’ll modify the **HTML** in `index.html` so that there are two tabs at the top of the sidebar: one for **Conversations** (the existing flow) and another for the **Vault**. When the user clicks **Vault**, we’ll show a folder/file explorer in the sidebar instead of the conversation list.

A suggested approach:

1. **Replace** the existing `<h2>Conversations</h2>` and **“+ New”** button with something like:
   ```html
   <div class="sidebar-header">
     <div class="sidebar-tabs">
       <button id="tab-conversations" class="tab-btn active">Conversations</button>
       <button id="tab-vault" class="tab-btn">Vault</button>
     </div>
     <!-- This button remains for new chat creation, but only shows if the user is on the "Conversations" tab -->
     <button onclick="newChat()" class="new-chat-btn" id="new-chat-btn">+ New</button>
   </div>
   ```
2. **Style** the tabs (`.tab-btn.active`) so one is highlighted when selected.  
3. In the **JavaScript** (in `script.js`), keep a variable like `currentTab = 'conversations'` or `'vault'`.  

---

## 2. Switching Between Tabs

### `script.js` Changes

- When the user clicks **Conversations**:
  1. Set `currentTab = 'conversations'`.
  2. Show the conversation list on the sidebar (as it already does).
  3. Show the “+ New” button to create new chats.
  4. Hide or clear any vault UI on the sidebar.

- When the user clicks **Vault**:
  1. Set `currentTab = 'vault'`.
  2. Hide the “+ New” chat button (or change it to a “New File”/“New Folder” button for the Vault).
  3. Fetch the directory structure of `vault/` (see below).
  4. Render that structure in the sidebar in a GitHub-like format (folders can be expanded/collapsed, files can be clicked).

**Example** (in `script.js`):

```js
let currentTab = 'conversations';

document.getElementById('tab-conversations').addEventListener('click', () => {
  currentTab = 'conversations';
  document.getElementById('tab-conversations').classList.add('active');
  document.getElementById('tab-vault').classList.remove('active');
  
  // Show conversation list
  document.getElementById('new-chat-btn').style.display = 'inline-block';
  refreshConversations(); // your existing function
  
  // Clear out any vault UI
  const list = document.getElementById('conversation-list');
  list.innerHTML = ''; // or show conversation items right after refreshConversations
});

document.getElementById('tab-vault').addEventListener('click', () => {
  currentTab = 'vault';
  document.getElementById('tab-conversations').classList.remove('active');
  document.getElementById('tab-vault').classList.add('active');
  
  // Hide the "new chat" button in vault mode
  document.getElementById('new-chat-btn').style.display = 'none';
  
  // Fetch and show the vault structure
  showVaultStructure();
});
```

> **Tip**: You might rename `conversation-list` to something more general, like `sidebar-content`, and dynamically fill it with conversation items or vault items depending on the tab.

---

## 3. Rendering the Vault Directory in the Sidebar

We need a new **endpoint** on the server to return a JSON representation of the `vault` folder, e.g.:

```json
[
  {
    "name": "folder1",
    "path": "folder1",
    "type": "directory",
    "children": [
      {
        "name": "subfile.md",
        "path": "folder1/subfile.md",
        "type": "file"
      }
    ]
  },
  {
    "name": "somefile.md",
    "path": "somefile.md",
    "type": "file"
  }
]
```

Then, in the front end, we can write a function:

```js
async function showVaultStructure() {
  try {
    // 1. Fetch directory structure from our new server endpoint
    const response = await fetch('/api/vault-structure');
    const vaultData = await response.json();
    
    // 2. Grab the same container used for the conversation list,
    //    or a new element if you prefer
    const list = document.getElementById('conversation-list');
    list.innerHTML = '';

    // 3. Render the directory tree
    renderVaultTree(vaultData, list);
  } catch (err) {
    console.error('Error loading vault structure', err);
  }
}

function renderVaultTree(entries, container) {
  entries.forEach(entry => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'vault-item';
    
    // If it's a directory
    if (entry.type === 'directory') {
      itemDiv.innerHTML = `<span class="vault-folder-name">${entry.name}</span>`;
      // Make it expandable/collapsible if desired
      // We can attach an onclick to toggle children
      const childrenContainer = document.createElement('div');
      childrenContainer.style.marginLeft = '20px';
      container.appendChild(itemDiv);
      container.appendChild(childrenContainer);

      // Render children
      if (entry.children) {
        renderVaultTree(entry.children, childrenContainer);
      }
    } else {
      // It's a file
      itemDiv.innerHTML = `<span class="vault-file-name">${entry.name}</span>`;
      // On click, load the file content on the right side
      itemDiv.addEventListener('click', () => {
        loadVaultFile(entry.path);
      });
      container.appendChild(itemDiv);
    }
  });
}
```

---

## 4. Displaying File Content on the Right

You already have a **right side** that shows the chat history. When in the Vault tab, we want that same main area (currently the `.main` > `.chat-container`) to display the **file content** instead of the chat. We can do this in multiple ways:

1. **Switch the entire `.main` area** when `currentTab === 'vault'`. For example, replace the `.chat-container` with a `.vault-container`.  
2. **Reuse the same container** but fill it with file content instead of chat messages if we’re in vault mode.

**Example** approach: create a new `<div>` or reuse `#chat-history`:

```js
async function loadVaultFile(filePath) {
  try {
    // 1. Request the file content from a new route: GET /api/vault-file?path=<filePath>
    const response = await fetch(`/api/vault-file?path=${encodeURIComponent(filePath)}`);
    if (!response.ok) throw new Error(`Unable to fetch file: ${filePath}`);
    
    const fileContent = await response.text();
    
    // 2. Clear the right-side container
    const history = document.getElementById('chat-history');
    history.innerHTML = '';

    // 3. Insert the file content
    //    Optionally, you can parse it as Markdown or just display as text
    const contentDiv = document.createElement('div');
    contentDiv.className = 'vault-file-content';
    contentDiv.textContent = fileContent;

    history.appendChild(contentDiv);
  } catch (err) {
    console.error('Error loading vault file:', err);
  }
}
```

> Note: This means we also need a **server endpoint** like `/api/vault-file` that:
> - Reads the file from `vault/<path>`.
> - Returns the text content.

---

## 5. Creating New Folders / Files in the Vault

When the user is on the **Vault** tab, we can show an additional button or two:
- **“+ New File”**
- **“+ New Folder”**

They might appear in the same place as the “+ New” conversation button or in the top of the vault view. When clicked:
1. Prompt the user for the **folder name** or **file name**.  
2. Send a POST request to a new endpoint (e.g., `/api/vault-new-file`) with the desired path.  
3. The server **creates** an empty file or folder in `vault/`.  
4. The front end calls `showVaultStructure()` again to refresh the directory listing.

**Example**:

```html
<!-- In index.html, next to the "Vault" tab or in the sidebar-header -->
<button class="vault-new-btn" id="vault-new-file" style="display:none;">+ New File</button>
<button class="vault-new-btn" id="vault-new-folder" style="display:none;">+ New Folder</button>
```

And in `script.js`:

```js
document.getElementById('tab-vault').addEventListener('click', () => {
  currentTab = 'vault';
  // Show these two buttons for the vault
  document.getElementById('vault-new-file').style.display = 'inline-block';
  document.getElementById('vault-new-folder').style.display = 'inline-block';

  // Hide the conversation button
  document.getElementById('new-chat-btn').style.display = 'none';
  
  showVaultStructure();
});

// "Create new file"
document.getElementById('vault-new-file').addEventListener('click', async () => {
  const newFileName = prompt('Enter new file name (e.g. "notes.md"):');
  if (!newFileName) return;

  await fetch('/api/vault-new-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath: newFileName })
  });
  showVaultStructure();
});

// "Create new folder"
document.getElementById('vault-new-folder').addEventListener('click', async () => {
  const newFolderName = prompt('Enter new folder name (e.g. "docs"):');
  if (!newFolderName) return;
  
  await fetch('/api/vault-new-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: newFolderName })
  });
  showVaultStructure();
});
```

Your back end must have **two new routes**:

```js
// POST /api/vault-new-file
// Creates an empty file in vault
app.post('/api/vault-new-file', (req, res) => {
  const { filePath } = req.body;
  // For example: "notes.md" => "vault/notes.md"
  const fullPath = path.join(__dirname, 'vault', filePath);
  fs.writeFileSync(fullPath, '', 'utf8');
  res.json({ success: true });
});

// POST /api/vault-new-folder
// Creates a folder
app.post('/api/vault-new-folder', (req, res) => {
  const { folderPath } = req.body;
  const fullDir = path.join(__dirname, 'vault', folderPath);
  fs.mkdirSync(fullDir, { recursive: true });
  res.json({ success: true });
});
```

---

## 6. Putting It All Together

1. **HTML** changes:
   - Add the **two tabs** for switching: “Conversations” and “Vault.”
   - Add optional **+ New File**, **+ New Folder** buttons that show up only in vault mode.
2. **CSS** changes:
   - Style the tabs (`.tab-btn`) and the active vs. inactive states.
   - Style the vault file/folder items (`.vault-item`, `.vault-folder-name`, `.vault-file-name`) so they look distinct.
3. **JS** changes:
   - Keep track of the **current tab** so you know whether to display chat or vault.
   - Add a function to **fetch** the vault’s directory structure and **render** it in the sidebar.
   - Add a function to **open** a file from the vault and display its contents in the right-hand pane.
   - Add functions to **create** a new file or folder (and endpoints on the server).
4. **Server** changes:
   - A new route to **list** the vault directory (e.g. `GET /api/vault-structure`), returning JSON describing folders/files.
   - A new route to **fetch** an individual file’s content (e.g. `GET /api/vault-file?path=...`).
   - A new route to **create** new files/folders in the vault.

With these adjustments:

- **Clicking Conversations Tab**: Shows your current conversation list on the left. The existing chat input/response area is on the right.  
- **Clicking Vault Tab**: Replaces the left column with a folder/file listing from `vault/`. The right side shows either a blank screen or the content of whichever file you clicked.  
- You can also have **buttons** to create new files/folders in the vault, then refresh the listing.  

Use the above structure to guide your implementation. If any step is unclear—such as how to build the recursive JSON for the vault or how to handle partial expansions—be sure to clarify requirements before coding.