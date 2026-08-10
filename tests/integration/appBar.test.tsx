/**
 * The compact app bar, and the menu that took the navigation.
 *
 * Gallery, About and Help used to be three links across the top of every page.
 * They are one control now, which means the things a row of links gave away for
 * free — that they are there, that you can reach them, that Escape gets you out
 * — all have to be provided and therefore checked.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '@/components/SiteHeader/SiteHeader';
import { type MenuDestination } from '@/components/SiteHeader/SiteMenu';

function open(current: MenuDestination | null = null) {
  const user = userEvent.setup();
  render(<SiteHeader current={current} />);
  return user;
}

const menuButton = () => screen.getByRole('button', { name: 'Site menu' });

describe('the app bar', () => {
  it('is a wordmark and a menu, and says so', () => {
    open();

    // Named, because three lines are not a word.
    expect(menuButton()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'APL Art' })).toBeInTheDocument();
  });

  it('keeps the destinations out of the way until they are asked for', async () => {
    const user = open();

    expect(screen.queryByRole('link', { name: 'Gallery' })).toBeNull();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuButton());

    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('list', { name: 'Site' });
    expect(within(menu).getByRole('link', { name: 'Gallery' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Game of Life' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'About' })).toBeInTheDocument();
    expect(within(menu).getByRole('link', { name: 'Help' })).toBeInTheDocument();
  });

  it('lists the destinations in one order, and each goes where it says', async () => {
    /*
     * Life is reachable from the menu or it is not reachable at all: it has no
     * card in the gallery, and the page itself renders no site header to come
     * back to. Its place in the order is part of that — it is somewhere to go and
     * watch, like the gallery, rather than a page about the site.
     */
    const user = open();
    await user.click(menuButton());

    const menu = screen.getByRole('list', { name: 'Site' });
    const links = within(menu).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Gallery', 'Game of Life', 'About', 'Help']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#/', '#/life', '#/about', '#/help']);
  });

  it('marks where you already are', async () => {
    const user = open('help');
    await user.click(menuButton());

    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Gallery' })).not.toHaveAttribute('aria-current');
  });

  it('puts the keyboard in the list when it opens', async () => {
    const user = open();
    await user.click(menuButton());

    // Somebody who opened it with the keyboard is already where they meant to be.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Gallery' })).toHaveFocus());
  });

  it('closes on Escape, and gives the keyboard back to the button', async () => {
    const user = open();
    await user.click(menuButton());
    expect(screen.getByRole('link', { name: 'Gallery' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('link', { name: 'Gallery' })).toBeNull();
    // Back where it came from, rather than at the top of the document.
    expect(menuButton()).toHaveFocus();
  });

  it('closes when something else is pressed', async () => {
    const user = open();
    await user.click(menuButton());

    await user.click(screen.getByRole('link', { name: 'APL Art' }));

    expect(screen.queryByRole('link', { name: 'Gallery' })).toBeNull();
  });

  it('closes when a destination is chosen', async () => {
    const user = open();
    await user.click(menuButton());

    await user.click(screen.getByRole('link', { name: 'About' }));

    // Otherwise the menu is still hanging open over the page it navigated to.
    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();
  });
});
