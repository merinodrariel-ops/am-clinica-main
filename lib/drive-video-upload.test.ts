import assert from 'node:assert/strict';
import test from 'node:test';
import { getUploadName, shouldUploadDirectlyToDrive, uploadFilesToDrive } from './drive-upload-files';

test('videos use a direct Google Drive resumable session instead of the Vercel file proxy', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
        calls.push({ input: String(input), init });
        if (String(input) === '/api/drive/upload-session') {
            return Response.json({ uploadUrl: 'https://www.googleapis.com/upload/drive/session-test' });
        }
        return Response.json({ id: 'drive-file-id' });
    };

    try {
        const video = new File(['video-bytes'], 'promo.mp4', { type: 'video/mp4' });
        const result = await uploadFilesToDrive([video], {
            folderId: 'patient-folder-id',
            patientId: 'patient-id',
        });

        assert.equal(result.successCount, 1);
        assert.deepEqual(result.errors, []);
        assert.equal(calls.length, 2);
        assert.equal(calls[0].input, '/api/drive/upload-session');
        assert.equal(calls[1].input, 'https://www.googleapis.com/upload/drive/session-test');
        assert.equal(calls[1].init?.method, 'PUT');
        assert.equal(calls[1].init?.body, video);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('multiple PLY files use independent direct Drive uploads and preserve their original names', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
        calls.push({ input: String(input), init });
        if (String(input) === '/api/drive/upload-session') {
            const requestBody = JSON.parse(String(init?.body)) as { fileName: string };
            return Response.json({ uploadUrl: `https://www.googleapis.com/upload/drive/${requestBody.fileName}` });
        }
        return Response.json({ id: 'drive-file-id' });
    };

    try {
        const upper = new File(['upper-bytes'], 'arcada-superior.ply');
        const lower = new File(['lower-bytes'], 'arcada-inferior.PLY');
        const result = await uploadFilesToDrive([upper, lower], {
            folderId: 'patient-folder-id',
            patientId: 'patient-id',
            fileNamePrefix: 'paciente_archivos',
        });

        assert.equal(result.successCount, 2);
        assert.deepEqual(result.errors, []);
        assert.equal(calls.length, 4);
        const firstSession = JSON.parse(String(calls[0].init?.body)) as { fileName: string; mimeType: string };
        const secondSession = JSON.parse(String(calls[2].init?.body)) as { fileName: string; mimeType: string };
        assert.equal(firstSession.fileName, 'arcada-superior.ply');
        assert.equal(firstSession.mimeType, 'application/octet-stream');
        assert.equal(secondSession.fileName, 'arcada-inferior.PLY');
        assert.equal(secondSession.mimeType, 'application/octet-stream');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('a missing Drive file id is reported for the exact PLY while later files still upload', async () => {
    const originalFetch = globalThis.fetch;
    let directUploadCount = 0;
    globalThis.fetch = async (input) => {
        if (String(input) === '/api/drive/upload-session') {
            return Response.json({ uploadUrl: 'https://www.googleapis.com/upload/drive/session-test' });
        }
        directUploadCount++;
        return directUploadCount === 1 ? Response.json({}) : Response.json({ id: 'second-file-id' });
    };

    try {
        const result = await uploadFilesToDrive([
            new File(['first'], 'primero.ply'),
            new File(['second'], 'segundo.ply'),
        ], { folderId: 'patient-folder-id', patientId: 'patient-id' });

        assert.equal(result.successCount, 1);
        assert.equal(result.errors.length, 1);
        assert.match(result.errors[0], /primero\.ply: Google Drive recibió el archivo pero no confirmó/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('only images receive the SEO upload prefix', () => {
    const image = new File(['image'], 'foto.jpg', { type: 'image/jpeg' });
    const model = new File(['model'], 'escaneo.ply');

    assert.match(getUploadName(image, 'paciente_archivos', 1), /^paciente_archivos_\d{4}-\d{2}_001\.jpg$/);
    assert.equal(getUploadName(model, 'paciente_archivos', 1), 'escaneo.ply');
    assert.equal(shouldUploadDirectlyToDrive(model), true);
});
