require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: Missing OPENAI_API_KEY in .env file');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONV_DIR = path.join(__dirname, 'conversations');
if (!fs.existsSync(CONV_DIR)) fs.mkdirSync(CONV_DIR);

const VAULT_DIR = path.join(__dirname, 'vault');
if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

let activeConversation = { id: null, file: null, messages: [] };

// Add this before other routes
app.use('/conversations', express.static(CONV_DIR, {
    setHeaders: (res, path) => {
        if (path.endsWith('.md')) {
            res.set('Content-Type', 'text/markdown');
        }
    }
}));

// New helper function to read conversation titles
const getConversationTitle = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const firstLine = content.split('\n')[0];
  return firstLine.replace('# ', '').trim();
};

// Add this helper function
function universalPath(inputPath) {
    return inputPath
        .replace(/[\\/]/g, path.sep) // Convert to OS separators
        .replace(/(\.\.)|[<>:"|?*]/g, '') // Sanitize
        .split(path.sep)
        .filter(segment => segment.trim() !== '')
        .join(path.sep);
}

// Update sanitizePath function
function sanitizePath(inputPath) {
    try {
        const cleanPath = universalPath(inputPath);
        const resolved = path.resolve(VAULT_DIR, cleanPath);
        const vaultRoot = path.resolve(VAULT_DIR);
        
        return resolved.startsWith(vaultRoot) &&
               !resolved.endsWith('..') &&
               resolved !== vaultRoot;
    } catch (err) {
        return false;
    }
}

// API routes should come BEFORE static files
app.use(express.json());

// Add all API endpoints here
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  try {
    if (!activeConversation.id) {
      activeConversation.id = Date.now();
      activeConversation.file = path.join(CONV_DIR, `conv_${activeConversation.id}.md`);
      fs.writeFileSync(activeConversation.file, `# Conversation ${activeConversation.id}\n\n`);
    }

    activeConversation.messages.push({ role: 'user', content: message });
    fs.appendFileSync(activeConversation.file, `## User\n${message}\n\n`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: activeConversation.messages,
    });

    const aiResponse = completion.choices[0].message.content;
    activeConversation.messages.push({ role: 'assistant', content: aiResponse });
    fs.appendFileSync(activeConversation.file, `## Assistant\n${aiResponse}\n\n`);

    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversations', (req, res) => {
  fs.readdir(CONV_DIR, (err, files) => {
    if (err) return res.status(500).send('Error reading conversations');
    const conversations = files.map(file => ({
      id: file,
      title: getConversationTitle(path.join(CONV_DIR, file))
    }));
    res.json(conversations.reverse());
  });
});

// New endpoints for conversation management
app.delete('/api/conversation/:id', (req, res) => {
  const filePath = path.join(CONV_DIR, req.params.id);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).send('Error deleting conversation');
    res.json({ success: true });
  });
});

app.put('/api/conversation/:id/rename', (req, res) => {
  const { newTitle } = req.body;
  const filePath = path.join(CONV_DIR, req.params.id);
  const content = fs.readFileSync(filePath, 'utf8');
  const newContent = content.replace(/^# .*?\n/, `# ${newTitle}\n`);
  fs.writeFileSync(filePath, newContent);
  res.json({ success: true });
});

app.post('/api/new-chat', (req, res) => {
  activeConversation = { id: null, file: null, messages: [] };
  res.json({ success: true });
});

// Vault structure endpoint
app.get('/api/vault-structure', (req, res) => {
    const getStructure = (dirPath) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.map(entry => {
            const absolutePath = path.join(dirPath, entry.name);
            const relativePath = path.relative(VAULT_DIR, absolutePath);
            
            return {
                name: entry.name,
                path: relativePath === '' ? entry.name : 
                    relativePath.split(path.sep).join('/'),
                type: entry.isDirectory() ? 'directory' : 'file',
                children: entry.isDirectory() ? getStructure(absolutePath) : null
            };
        });
    };

    try {
        const structure = getStructure(VAULT_DIR);
        res.json(structure);
    } catch (err) {
        res.status(500).json({ error: 'Error reading vault structure' });
    }
});

// Vault file content endpoint
app.get('/api/vault-file', (req, res) => {
    const rawPath = req.query.path;
    
    // Convert all slashes to OS-specific format
    const osSafePath = rawPath.replace(/[\\/]/g, path.sep);
    
    // Normalize using path module
    const normalizedPath = path.normalize(
        path.join(VAULT_DIR, osSafePath)
    );

    // Security check using resolved path
    if (!normalizedPath.startsWith(path.resolve(VAULT_DIR))) {
        return res.status(403).json({ error: 'Path traversal attempt' });
    }

    // Existence check
    fs.access(normalizedPath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Consistent encoding
        res.sendFile(normalizedPath, {
            headers: { 'Content-Type': 'text/markdown' }
        });
    });
});

// Vault file creation endpoint
app.post('/api/vault-new-file', (req, res) => {
  const { filePath } = req.body;
  if (!sanitizePath(filePath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const fullPath = path.join(VAULT_DIR, filePath);
  if (fs.existsSync(fullPath)) {
    return res.status(400).json({ error: 'File already exists' });
  }

  fs.writeFile(fullPath, '', (err) => {
    if (err) return res.status(500).json({ error: 'File creation failed' });
    res.json({ success: true });
  });
});

// Vault folder creation endpoint
app.post('/api/vault-new-folder', (req, res) => {
  const { folderPath } = req.body;
  if (!sanitizePath(folderPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const fullPath = path.join(VAULT_DIR, folderPath);
  if (fs.existsSync(fullPath)) {
    return res.status(400).json({ error: 'Folder already exists' });
  }

  fs.mkdir(fullPath, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ error: 'Folder creation failed' });
    res.json({ success: true });
  });
});

// Add vault operations endpoints
app.put('/api/vault-rename', (req, res) => {
    const { oldPath, newName } = req.body;
    const fullOldPath = path.join(VAULT_DIR, oldPath);
    const fullNewPath = path.join(VAULT_DIR, newName);
    
    if (!sanitizePath(fullOldPath) || !sanitizePath(fullNewPath)) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    fs.rename(fullOldPath, fullNewPath, (err) => {
        if (err) return res.status(500).json({ error: 'Rename failed' });
        res.json({ success: true });
    });
});

app.delete('/api/vault-delete/:path', (req, res) => {
    const targetPath = path.join(VAULT_DIR, req.params.path);
    if (!sanitizePath(targetPath)) return res.status(400).json({error: 'Invalid path'});

    fs.rm(targetPath, {recursive: true}, (err) => {
        if (err) return res.status(500).json({error: 'Deletion failed'});
        res.json({success: true});
    });
});

app.put('/api/vault-move/:path', (req, res) => {
    const oldPath = path.join(VAULT_DIR, req.params.path);
    const newPath = path.join(VAULT_DIR, req.body.newPath);
    
    if (!sanitizePath(oldPath) || !sanitizePath(newPath)) {
        return res.status(400).json({error: 'Invalid path'});
    }

    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).json({error: 'Move failed'});
        res.json({success: true});
    });
});

// Add before static files middleware
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Static files should be LAST
app.use(express.static('public'));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));