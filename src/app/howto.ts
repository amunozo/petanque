/**
 * "How to play": a short paginated card deck (swipe or Next / Back) with a small
 * illustration per page. Reached from the menu and the ⋯ sheet, and offered once on
 * first launch (skippable). Styles: "How to play" section of src/style.css (ht-*).
 */
import { loftIconSvg, LOFT_OPTIONS } from '../input';
import { onLangChange, t } from '../i18n';
import { button, el, shieldPointer } from './dom';
import { goalArt, rulesArt, scoreArt, throwArt, turnArt } from './howtoArt';
import { icon } from './icons';

export interface HowToFacts {
  /** Points to win in the two match lengths. */
  quick: number;
  standard: number;
  /** Legal jack distance range (m). */
  jackMin: number;
  jackMax: number;
}

export interface HowTo {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Fires whenever it closes (skipped, finished or dismissed). */
  onClose(fn: () => void): void;
}

interface Page {
  art: string | null;
  title: string;
  body: () => HTMLElement;
}

const para = (text: string): HTMLElement => el('p', 'ht-text', text);

export function createHowTo(parent: HTMLElement, facts: () => HowToFacts): HowTo {
  const root = el('div', 'ht-root');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.hidden = true;
  shieldPointer(root);

  const card = el('div', 'ht-card');
  const head = el('div', 'ht-head');
  const title = el('h2', 'ht-title');
  title.id = 'ht-title';
  root.setAttribute('aria-labelledby', title.id);
  const skip = button('ht-skip', '');
  head.append(title, skip);

  const track = el('div', 'ht-track');
  track.tabIndex = 0;
  const dotsEl = el('div', 'ht-dots');
  dotsEl.setAttribute('role', 'img');
  const nav = el('div', 'ht-nav');
  const back = button('ht-btn ht-back', '');
  const next = button('ht-btn ht-next', '');
  nav.append(back, next);
  card.append(head, track, dotsEl, nav);
  root.append(card);
  parent.append(root);

  let index = 0;
  let pages: Page[] = [];
  let closeFn: () => void = () => undefined;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const buildPages = (): Page[] => {
    const f = facts();
    const types = (): HTMLElement => {
      const list = el('div', 'ht-types');
      const text = { roll: t('howto.types.roll'), half: t('howto.types.half'), lob: t('howto.types.lob'), shoot: t('howto.types.shoot') } as const;
      const names = { roll: t('loft.roll'), half: t('loft.half'), lob: t('loft.lob'), shoot: t('loft.shoot') } as const;
      for (const o of LOFT_OPTIONS) {
        const row = el('div', `ht-type ht-type-${o.id}`);
        const ic = el('span', 'ht-type-icon');
        ic.innerHTML = loftIconSvg(o.icon);
        const words = el('span', 'ht-type-words');
        words.append(el('b', 'ht-type-name', names[o.id]), el('span', 'ht-type-desc', text[o.id]));
        row.append(ic, words);
        list.append(row);
      }
      return list;
    };
    const rules = (): HTMLElement => {
      const list = el('ul', 'ht-rules');
      const jackRow = el('li', 'ht-rule');
      const ok = el('span', 'ht-rule-icon is-ok');
      ok.innerHTML = icon('check', 18);
      jackRow.append(ok, el('span', '', t('howto.rules.jack', { lo: f.jackMin, hi: f.jackMax })));
      const deadRow = el('li', 'ht-rule');
      const no = el('span', 'ht-rule-icon is-no');
      no.innerHTML = icon('close', 18);
      deadRow.append(no, el('span', '', t('howto.rules.dead')));
      list.append(jackRow, deadRow);
      return list;
    };
    return [
      { art: goalArt(), title: t('howto.goal.title'), body: () => para(t('howto.goal.text')) },
      { art: throwArt(), title: t('howto.throw.title'), body: () => para(t('howto.throw.text')) },
      { art: null, title: t('howto.types.title'), body: types },
      { art: turnArt(), title: t('howto.turn.title'), body: () => para(t('howto.turn.text')) },
      { art: scoreArt(), title: t('howto.score.title'), body: () => para(t('howto.score.text', { quick: f.quick, standard: f.standard })) },
      { art: rulesArt(f.jackMin, f.jackMax), title: t('howto.rules.title'), body: rules },
    ];
  };

  const width = (): number => track.clientWidth || 1;
  const paintNav = (): void => {
    const last = index === pages.length - 1;
    back.disabled = index === 0;
    back.textContent = t('howto.back');
    next.textContent = last ? t('howto.done') : t('howto.next');
    next.classList.toggle('is-final', last);
    skip.hidden = last;
    dotsEl.setAttribute('aria-label', t('howto.page', { n: index + 1, total: pages.length }));
    dotsEl.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === index));
    pages.forEach((_, i) => track.children[i]?.setAttribute('aria-hidden', String(i !== index)));
  };

  const build = (): void => {
    pages = buildPages();
    title.textContent = t('howto.title');
    skip.textContent = t('howto.skip');
    track.replaceChildren(
      ...pages.map((p, i) => {
        const page = el('section', 'ht-page');
        page.setAttribute('aria-roledescription', 'slide');
        if (p.art) {
          const art = el('div', 'ht-art');
          art.innerHTML = p.art;
          page.append(art);
        }
        page.append(el('h3', 'ht-page-title', p.title), p.body());
        page.dataset['page'] = String(i);
        return page;
      }),
    );
    dotsEl.replaceChildren(...pages.map(() => el('i', '')));
    paintNav();
  };

  const goTo = (i: number, smooth = true): void => {
    index = Math.max(0, Math.min(pages.length - 1, i));
    track.scrollTo({ left: index * width(), behavior: smooth && !reduced ? 'smooth' : 'auto' });
    paintNav();
  };

  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.max(0, Math.min(pages.length - 1, Math.round(track.scrollLeft / width())));
      if (i !== index) {
        index = i;
        paintNav();
      }
    });
  });
  window.addEventListener('resize', () => {
    if (!root.hidden) goTo(index, false);
  });

  const close = (): void => {
    if (root.hidden) return;
    root.hidden = true;
    document.body.classList.remove('is-dialog');
    closeFn();
  };
  skip.addEventListener('click', close);
  back.addEventListener('click', () => goTo(index - 1));
  next.addEventListener('click', () => (index >= pages.length - 1 ? close() : goTo(index + 1)));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') goTo(index + 1);
    else if (e.key === 'ArrowLeft') goTo(index - 1);
  });
  // Tap outside the card = skip.
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  build();
  onLangChange(() => {
    build();
    if (!root.hidden) goTo(index, false);
  });

  return {
    open() {
      if (!root.hidden) return;
      build();
      index = 0;
      root.hidden = false;
      document.body.classList.add('is-dialog');
      track.scrollLeft = 0;
      paintNav();
    },
    close,
    isOpen: () => !root.hidden,
    onClose(fn) {
      closeFn = fn;
    },
  };
}
