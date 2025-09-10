require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fsp = require('fs').promises;
const http = require('http');
const archiver = require('archiver');
const { convertProcedure, analyzeProcedure } = require('./converter');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);

app.post('/api/analyze-procedure', async (req, res) => {
    const { filePath, dbType, procedureCode: procedureCodeFromRequest } = req.body;

    let procedureCode;
    if (procedureCodeFromRequest) {
        procedureCode = procedureCodeFromRequest;
    } else if (filePath) {
        try {
            procedureCode = await fsp.readFile(filePath, 'utf8');
        } catch (err) {
            console.error(`Error reading file from path: ${filePath}`, err);
            return res.status(500).send(`Could not read file at path: ${filePath}`);
        }
    } else {
        return res.status(400).send('`filePath` or `procedureCode` is required.');
    }

    try {
        const analysis = await analyzeProcedure(procedureCode, dbType);
        res.json(analysis);
    } catch (error) {
        console.error('Error in /api/analyze-procedure:', error.response ? error.response.data : error.message);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).send(`Failed to analyze procedure. ${errorMsg}`);
    }
});

app.post('/api/convert-procedure', async (req, res) => {
    const { filePath, dbType, procedureCode: procedureCodeFromRequest } = req.body;

    let procedureCode;
    if (procedureCodeFromRequest) {
        procedureCode = procedureCodeFromRequest;
    } else if (filePath) {
        try {
            procedureCode = await fsp.readFile(filePath, 'utf8');
        } catch (err) {
            console.error(`Error reading file from path: ${filePath}`, err);
            return res.status(500).send(`Could not read file at path: ${filePath}`);
        }
    } else {
        return res.status(400).send('`filePath` or `procedureCode` is required.');
    }

    try {
        const files = await convertProcedure(procedureCode, dbType);

        console.log('Generating zip archive...');
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.attachment('jpa-converted-project.zip');
        archive.pipe(res);

        for (const fPath in files) {
            if (typeof files[fPath] === 'string') {
                archive.append(files[fPath], { name: fPath });
            }
        }
        await archive.finalize();
        console.log('Zip archive sent successfully.');

    } catch (error) {
        console.error('Error in /api/convert-procedure:', error.response ? error.response.data : error.message);
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).send(`Failed to convert procedure. ${errorMsg}`);
    }
});

server.listen(port, () => {
  console.log(`JPA Conversion Server listening at http://localhost:${port}`);
});
