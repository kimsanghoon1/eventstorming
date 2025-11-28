const fs = require('fs');
const path = require('path');

const filesToFix = [
    'data/민원서비스/민원서비스.json',
    'data/onlineshoppingmall/uml-order-uml.json'
];

function fixFile(filePath) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        return;
    }

    console.log(`Fixing paths in ${filePath}...`);
    const content = fs.readFileSync(fullPath, 'utf8');
    let data;
    try {
        data = JSON.parse(content);
    } catch (e) {
        console.error(`Failed to parse JSON: ${e.message}`);
        return;
    }

    let modified = false;

    if (data.items) {
        data.items.forEach(item => {
            if (item.linkedDiagram && item.linkedDiagram.startsWith('data/')) {
                item.linkedDiagram = item.linkedDiagram.substring(5);
                modified = true;
            }
        });
    }

    if (modified) {
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Fixed ${filePath} successfully.`);
    } else {
        console.log(`No changes needed for ${filePath}.`);
    }
}

filesToFix.forEach(file => fixFile(file));
