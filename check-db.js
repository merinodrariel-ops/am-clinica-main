
const NOTION_API_KEY = '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';
async function main() {
    const id = '2ef29b892a9380b98d12e9aa07bc2951';
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28'
        }
    });
    const data = await response.json();
    console.log(`DB ID: ${data.parent.database_id}`);
}
main().catch(console.error);
