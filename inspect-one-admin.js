
const NOTION_API_KEY = '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';
async function main() {
    const id = '2f029b892a93804db8b4e8f7d9ef8385';
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28'
        }
    });
    console.log(JSON.stringify(await response.json(), null, 2));
}
main().catch(console.error);
