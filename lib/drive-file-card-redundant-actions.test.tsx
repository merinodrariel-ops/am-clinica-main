import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DriveFileCard from '@/components/patients/drive/DriveFileCard';
import type { DriveFile } from '@/app/actions/patient-files-drive';

const imageFile: DriveFile = {
    id: 'foto-portada-test',
    name: 'frente-facial.jpg',
    mimeType: 'image/jpeg',
    webViewLink: 'https://drive.google.com/file/d/foto-portada-test/view',
    createdTime: '2026-07-06T12:00:00.000Z',
    thumbnailLink: 'https://example.com/thumb.jpg',
};

test('photo grid card does not render redundant cover or smile-design actions', () => {
    const html = renderToStaticMarkup(
        <DriveFileCard
            file={imageFile}
            onPreview={() => undefined}
            onDelete={() => undefined}
            onShare={() => undefined}
            onShareWithPatient={() => undefined}
            onShareEmail={() => undefined}
            onTag={() => undefined}
        />
    );

    assert.doesNotMatch(html, /Usar como portada/);
    assert.doesNotMatch(html, /Smile Design con IA/);
});

test('photo grid card keeps the share button when other inline actions are hidden', () => {
    const html = renderToStaticMarkup(
        <DriveFileCard
            file={imageFile}
            onPreview={() => undefined}
            onShare={() => undefined}
            onShareWithPatient={() => undefined}
            onShareEmail={() => undefined}
            hideInlineActions
        />
    );

    assert.match(html, /title="Compartir"/);
    assert.doesNotMatch(html, /Usar como portada/);
    assert.doesNotMatch(html, /Smile Design con IA/);
});
