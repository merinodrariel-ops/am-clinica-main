/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: 'secret_mock' });

console.log('notion.dataSources:', notion.dataSources);
if (notion.dataSources) {
    console.log('notion.dataSources.query:', notion.dataSources.query);
}
console.log('Keys:', Object.keys(notion.databases));
