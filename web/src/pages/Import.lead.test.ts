import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setUiLang, t } from '../i18n';
import { ImportLead } from './Import';

const html = (name: string) => renderToStaticMarkup(createElement(ImportLead, { name }));

describe('add-cards heading', () => {
  it('bolds the test name inside the English sentence and does not print a tag', () => {
    setUiLang('en');
    expect(t('import_lead')).not.toMatch(/[<>]/);
    const out = html('Chemistry test');
    expect(out).toBe('<p class="lead" data-testid="import-lead">Add material to <b>Chemistry test</b></p>');
    expect(out).not.toContain('<b></b>');
  });

  it('bolds the test name in the middle of the German sentence', () => {
    setUiLang('de');
    expect(t('import_lead')).not.toMatch(/[<>]/);
    expect(html('Chemie-Test')).toBe('<p class="lead" data-testid="import-lead">Material für <b>Chemie-Test</b> hinzufügen</p>');
  });
});
