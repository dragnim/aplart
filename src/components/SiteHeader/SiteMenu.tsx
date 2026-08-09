/**
 * Where the site's own destinations live once the bar belongs to the artwork.
 *
 * Gallery, About and Help are secondary while somebody is making something, so
 * they fold into one control rather than taking three slots of a bar that now
 * also has to hold a title and three artwork actions. They are still one press
 * away, and they are still links — the menu opens a list of destinations, not a
 * set of commands.
 *
 * A CSS hamburger rather than an icon: three rules, no dependency, and it scales
 * with the type around it.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDismissable } from '@/components/useDismissable';
import styles from './SiteMenu.module.css';

interface Props {
  /** Which destination is showing, so the menu can mark it current. */
  readonly current: 'gallery' | 'about' | 'help' | null;
}

const DESTINATIONS = [
  { id: 'gallery', label: 'Gallery', href: '#/' },
  { id: 'about', label: 'About', href: '#/about' },
  { id: 'help', label: 'Help', href: '#/help' },
] as const;

export function SiteMenu({ current }: Props) {
  const [open, setOpen] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  // A press outside, and a press on another control, both mean "not this".
  useDismissable(open, group, close);

  /*
   * Escape closes this and nothing else.
   *
   * Stopped here rather than allowed to bubble, because the layers underneath
   * also listen: in Focus mode the same key closes the drawer and then leaves
   * Focus entirely. A visitor who opens this menu and changes their mind expects
   * one press to undo one thing.
   */
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  }, []);

  /* Focus moves into the list when it opens, so the keyboard is already there. */
  const firstItem = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (open) firstItem.current?.focus();
  }, [open]);

  return (
    <div className={styles.group} ref={group} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={trigger}
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        // Named, because three lines are not a word. The label says what opens
        // rather than what it looks like.
        aria-label="Site menu"
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className={styles.bars} aria-hidden="true" />
      </button>

      {open && (
        <ul className={styles.menu} id={menuId} aria-label="Site">
          {DESTINATIONS.map((destination, index) => (
            <li key={destination.id}>
              <a
                className={styles.item}
                href={destination.href}
                ref={index === 0 ? firstItem : undefined}
                onClick={close}
                {...(current === destination.id ? { 'aria-current': 'page' as const } : {})}
              >
                {destination.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
