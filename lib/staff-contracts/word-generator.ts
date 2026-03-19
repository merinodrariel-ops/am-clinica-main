/**
 * Generates a .doc file (HTML-based Word format) from plain contract text.
 * Word, LibreOffice, and Google Docs can all open this format.
 */
export function generateContractWord(
    fullText: string,
    filename: string
): void {
    // Convert plain text to basic HTML preserving structure
    const lines = fullText.split('\n');
    let html = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            html += '<p>&nbsp;</p>';
            continue;
        }
        // Separator lines
        if (/^[═=─-]{4,}$/.test(trimmed)) {
            html += '<hr style="border:1px solid #ccc;margin:8px 0"/>';
            continue;
        }
        // Main headings: all caps short lines
        if (trimmed === trimmed.toUpperCase() && trimmed.length < 80 && /[A-ZÁÉÍÓÚÑ]/.test(trimmed)) {
            html += `<p style="font-family:Arial;font-size:11pt;font-weight:bold;text-align:center;margin:4px 0">${escHtml(trimmed)}</p>`;
            continue;
        }
        // Clause headings (PRIMERA —, SEGUNDA —, etc.)
        if (/^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉC\w+)\s+—/.test(trimmed)) {
            html += `<p style="font-family:Arial;font-size:10pt;font-weight:bold;margin:8px 0 3px">${escHtml(trimmed)}</p>`;
            continue;
        }
        // Norma headings (1. TITULO, 2. TITULO, etc.)
        if (/^\d+\.\s+[A-Z]/.test(trimmed) && trimmed.length < 60) {
            html += `<p style="font-family:Arial;font-size:10pt;font-weight:bold;margin:6px 0 2px">${escHtml(trimmed)}</p>`;
            continue;
        }
        // Signature line
        if (trimmed.startsWith('POR ') || trimmed.startsWith('Dr.') || trimmed.startsWith('DNI:') || /^_{3,}/.test(trimmed)) {
            html += `<p style="font-family:Arial;font-size:10pt;margin:2px 0">${escHtml(trimmed)}</p>`;
            continue;
        }
        // Body text
        html += `<p style="font-family:Arial;font-size:10pt;text-align:justify;margin:2px 0;line-height:1.4">${escHtml(trimmed)}</p>`;
    }

    const docHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <title>Contrato</title>
  <!--[if gte mso 9]>
  <xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml>
  <![endif]-->
  <style>
    @page { margin: 2.5cm; }
    body { font-family: Arial, sans-serif; font-size: 10pt; }
  </style>
</head>
<body>${html}</body>
</html>`;

    const blob = new Blob([docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.doc') ? filename : filename + '.doc';
    a.click();
    URL.revokeObjectURL(url);
}

function escHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
