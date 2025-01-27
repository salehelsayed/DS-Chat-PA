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
app.use(express.json());
app.use(express.static('public'));

const CONV_DIR = path.join(__dirname, 'conversations');
if (!fs.existsSync(CONV_DIR)) fs.mkdirSync(CONV_DIR);

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

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));