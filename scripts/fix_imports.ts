import * as fs from 'fs';

const filePath = 'components/portal/ProsoftImporter.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// Use regex to locate and merge the imports
const lucideImport1 = /import \{ ([\s\S]*?) \} from 'lucide-react';/m;
const lucideImport2 = /import \{ ([\s\S]*?) \} from 'lucide-react';/g;

const matches = [...code.matchAll(lucideImport2)];

if (matches.length >= 2) {
    const allIcons = new Set();
    matches.forEach(match => {
        match[1].split(',').forEach(icon => allIcons.add(icon.trim()));
    });

    const mergedIcons = Array.from(allIcons).filter(Boolean).sort().join(', ');
    const newImportLine = `import { ${mergedIcons} } from 'lucide-react';`;

    // Replace the first one and remove the second one
    let newCode = code.replace(matches[0][0], newImportLine);
    newCode = newCode.replace(matches[1][0], '');

    // Clean up possible double newlines
    newCode = newCode.replace(/\n\n\n/g, '\n\n');

    fs.writeFileSync(filePath, newCode);
    console.log('Successfully merged lucide-react imports');
} else {
    console.log('Could not find two lucide-react imports to merge');
}
