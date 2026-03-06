const xlsx = require('xlsx');

try {
    const workbook = xlsx.readFile('/Users/am/Downloads/12Sumario.xls');
    const sheetName = workbook.SheetNames[0];
    const csvString = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    console.log(csvString.split('\n').slice(0, 50).join('\n'));
} catch (e) {
    console.error("Error formatting:", e);
}
