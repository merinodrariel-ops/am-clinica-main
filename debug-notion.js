
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: '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' });
console.log('Keys in notion:', Object.keys(notion));
console.log('Keys in notion.databases:', Object.keys(notion.databases));
