'use server';

import fs from 'fs';
import path from 'path';

export async function getMarketingAudit() {
    try {
        const filePath = path.join(process.cwd(), '.agent', 'MARKETING-AUDIT.md');
        if (!fs.existsSync(filePath)) {
            return { success: false, error: 'Audit file not found' };
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return { success: true, content };
    } catch (error) {
        return { success: false, error: 'Error reading audit file' };
    }
}
