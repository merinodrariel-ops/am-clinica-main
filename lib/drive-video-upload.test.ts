import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadFilesToDrive } from './drive-upload-files';

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
