const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

app.use(cors());
app.use(express.json());

// Get all board names
app.get('/api/boards', (req, res) => {
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      return res.status(500).send('Error reading boards directory');
    }
    const boardNames = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));
    res.status(200).json(boardNames);
  });
});

// Load a specific board
app.get('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        return res.status(200).json([]); // If no board, return empty array
      }
      return res.status(500).send('Error loading board');
    }
    res.status(200).json(JSON.parse(data));
  });
});

// Save a board
app.post('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);
  const data = req.body;

  fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {
    if (err) {
      return res.status(500).send('Error saving board');
    }
    res.status(200).send('Board saved successfully');
  });
});

// Delete a board
app.delete('/api/boards/:name', (req, res) => {
  const boardName = req.params.name;
  const filePath = path.join(dataDir, `${boardName}.json`);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(500).send('Error deleting board');
    }
    res.status(200).send('Board deleted successfully');
  });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
