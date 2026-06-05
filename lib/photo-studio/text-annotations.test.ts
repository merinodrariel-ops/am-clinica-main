import test from 'node:test';
import assert from 'node:assert/strict';

import { cloneTextAnnotationForPaste } from './text-annotations';

test('clones a selected text annotation with a new id and visible offset', () => {
    const copy = cloneTextAnnotationForPaste(
        {
            id: 'text-original',
            x: 0.2,
            y: 0.3,
            text: 'Diseño de sonrisa x10',
            color: 'white',
            width: 0.4,
            fontSize: 24,
            align: 'left',
        },
        'text-copy',
    );

    assert.equal(copy.id, 'text-copy');
    assert.equal(copy.text, 'Diseño de sonrisa x10');
    assert.equal(copy.x, 0.22);
    assert.equal(copy.y, 0.32);
});

test('keeps pasted text annotation inside the canvas bounds', () => {
    const copy = cloneTextAnnotationForPaste(
        {
            id: 'text-original',
            x: 0.98,
            y: 0.98,
            text: 'USD 1200',
            color: 'yellow',
            width: 0.4,
            fontSize: 24,
            align: 'left',
        },
        'text-copy',
    );

    assert.equal(copy.x, 0.98);
    assert.equal(copy.y, 0.98);
});

