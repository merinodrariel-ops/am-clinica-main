async function main() {
    const fs = await import('node:fs');
    const jan = JSON.parse(fs.readFileSync('notion_jan_rec_raw.json', 'utf8'));
    const interesting = jan.filter(p => [1340000, 755000, 910000].includes(Math.abs(p.ars)));
    console.table(interesting);
}

void main().catch(console.error);
