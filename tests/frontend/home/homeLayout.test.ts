import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { StarjotHome } from '../../../src/frontend/home/StarjotHome';
import { updatePreferences } from '../../../src/frontend/app/preferences';

describe('Home layout', () => {
  it('shows Notespace before Boardspace and hides a disabled space', () => {
    updatePreferences({ spaces: { notes: true, boardspace: true } });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const order = () => Array.from(host.querySelectorAll('.home-bento')).map(panel => panel.classList[1]);

    try {
      act(() => root.render(createElement(StarjotHome, {
        onOpenNote: vi.fn(), onOpenNotespace: vi.fn(), onOpenBoardspace: vi.fn(), onOpenBoardView: vi.fn()
      })));
      expect(order()).toEqual(['home-bento-capture', 'home-bento-notespace', 'home-bento-continue', 'home-bento-boardspace', 'home-bento-today']);
      expect(host.querySelector('.home-customize')).toBeNull();
      act(() => updatePreferences({ spaces: { notes: true, boardspace: false } }));
      expect(host.querySelector('.home-bento-boardspace')).toBeNull();
      expect(host.querySelector('.home-bento-notespace')).not.toBeNull();
    } finally {
      act(() => root.unmount());
      host.remove();
      updatePreferences({ spaces: { notes: true, boardspace: true } });
    }
  });
});
