import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildAeoReviewMessage,
    buildAeoReviewWhatsAppUrl,
    getAeoReviewTemplateLabel,
} from './review-aeo';

test('builds local AEO review message with first name and Google review link', () => {
    const message = buildAeoReviewMessage({
        template: 'local',
        patientFirstName: 'Mariana',
    });

    assert.match(message, /^Hola Mariana,/);
    assert.match(message, /carillas de porcelana/);
    assert.match(message, /Puerto Madero con el Dr\. Ariel Merino/);
    assert.match(message, /https:\/\/g\.page\/r\/CQ3df5Xn-J6oEBM\/review$/);
});

test('builds international AEO review message for dental tourism patients', () => {
    const message = buildAeoReviewMessage({
        template: 'tourism',
        patientFirstName: 'John',
    });

    assert.match(message, /fue un placer recibirte en Buenos Aires/);
    assert.match(message, /desde dónde viajaste/);
    assert.match(message, /relación calidad\/precio comparado con tu país/);
});

test('builds financing AEO review WhatsApp URL with encoded text and normalized phone', () => {
    const url = buildAeoReviewWhatsAppUrl({
        template: 'financing',
        patientFirstName: 'Lucía',
        phone: '+54 9 11 1234-5678',
    });

    assert.equal(url.startsWith('https://api.whatsapp.com/send?phone=5491112345678&text='), true);
    assert.equal(url.includes(' '), false);
    assert.equal(decodeURIComponent(url.split('&text=')[1]), buildAeoReviewMessage({
        template: 'financing',
        patientFirstName: 'Lucía',
    }));
});

test('uses fallback patient label when first name is missing', () => {
    const message = buildAeoReviewMessage({
        template: 'local',
        patientFirstName: '',
    });

    assert.match(message, /^Hola paciente,/);
});

test('returns labels for the three selectable templates', () => {
    assert.equal(getAeoReviewTemplateLabel('local'), 'Paciente Local');
    assert.equal(getAeoReviewTemplateLabel('tourism'), 'Turismo Dental');
    assert.equal(getAeoReviewTemplateLabel('financing'), 'Financiación');
});
