const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: './google_credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
});

async function testMove() {
    const drive = google.drive({ version: 'v3', auth });
    try {
        const fileId = '1J_5CWO6bFaJppyFrxbXZCF4b2N4c9Bb3'; // file shown in test_mcp2.js output
        const file = await drive.files.get({
            fileId,
            fields: 'parents'
        });
        console.log('Current parents:', file.data.parents);

        // update
        const res = await drive.files.update({
            fileId,
            addParents: '15k42EQnpx7T_nQsp9bf9BZK0wsmF5sU9', // another folder
            removeParents: file.data.parents.join(','),
            supportsAllDrives: true,
            enforceSingleParent: true,
            fields: 'id, parents'
        });
        console.log('Update result:', res.data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

testMove();
