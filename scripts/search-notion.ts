import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function main() {
    try {
        console.log('Searching Notion for Kobal...');
        const response = await notion.search({
            query: 'Kobal',
            filter: {
                value: 'page',
                property: 'object'
            }
        });

        console.log(`Found ${response.results.length} pages.`);
        for (const page of response.results) {
            console.log(`--- PAGE ID: ${page.id} ---`);
            // The typing of page is technically UnknownPage or Page
            const p = page as any;
            if (p.properties) {
                // Let's print properties related to slides, presentation, etc.
                const props = p.properties;
                for (const key of Object.keys(props)) {
                    const prop = props[key];
                    if (prop.type === 'url') {
                        console.log(`${key} [URL]: ${prop.url}`);
                    } else if (prop.type === 'title') {
                        const text = prop.title.map((t: any) => t.plain_text).join('');
                        console.log(`${key} [TITLE]: ${text}`);
                    }
                }
            }
            console.log('URL to page:', p.url);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
