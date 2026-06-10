import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildCenteredAspectCrop,
    getCropAspectPreset,
    shouldExportPhotoAsPng,
} from './crop-aspects';

describe('photo studio crop aspect helpers', () => {
    it('centers a vertical preset crop inside the rendered image', () => {
        const crop = buildCenteredAspectCrop(900, 1200, 3 / 4);

        assert.equal(crop.unit, '%');
        assert.ok(crop.x >= 0);
        assert.ok(crop.y >= 0);
        assert.ok(crop.x + crop.width <= 100.001);
        assert.ok(crop.y + crop.height <= 100.001);
        assert.ok(Math.abs((crop.width * 900) / (crop.height * 1200) - 3 / 4) < 0.01);
    });

    it('returns free crop as the fallback preset', () => {
        assert.equal(getCropAspectPreset('free').label, 'Libre');
    });

    it('uses png only when transparency must be preserved', () => {
        assert.equal(shouldExportPhotoAsPng({ fileName: 'rostro.jpg', bgDone: true, bgColor: 'transparent' }), true);
        assert.equal(shouldExportPhotoAsPng({ fileName: 'rostro.jpg', bgDone: true, bgColor: 'white' }), false);
        assert.equal(shouldExportPhotoAsPng({ fileName: 'rostro.png', bgDone: false, bgColor: 'transparent' }), true);
        assert.equal(shouldExportPhotoAsPng({ fileName: 'rostro.jpg', bgDone: false, bgColor: 'transparent', hasTransparentBg: true }), true);
        assert.equal(shouldExportPhotoAsPng({ fileName: 'rostro.jpg', bgDone: false, bgColor: 'transparent', mimeType: 'image/png' }), true);
        assert.equal(shouldExportPhotoAsPng({ fileName: 'rostro.jpg', bgDone: false, bgColor: 'transparent', mimeType: 'image/jpeg' }), false);
    });
});
