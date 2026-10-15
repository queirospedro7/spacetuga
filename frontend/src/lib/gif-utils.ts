import { toast } from 'sonner';
import { api } from './api';

export const FAVORITE_GIFS_KEY = 'tuga.favorite_gifs';
export const LEGACY_SAVED_KEY = 'tuga.saved_gifs';
export const FAVORITE_GIFS_EVENT = 'tuga:favorite_gifs_updated';

/**
 * Normalizes and validates a GIF or animated media URL.
 * Handles direct links, Giphy URLs, Imgur links, Tenor links, etc.
 */
export function safeGifUrl(value: string): string | null {
  if (!value) return null;
  const raw = value.startsWith('GIF:') ? value.slice(4).trim() : value.trim();
  if (!/^https:\/\//i.test(raw)) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    if (url.username || url.password) return null;

    // Giphy web page conversion: https://giphy.com/gifs/<slug-or-name>-<id>
    if ((host === 'giphy.com' || host.endsWith('.giphy.com')) && pathname.startsWith('/gifs/')) {
      const parts = url.pathname.replace(/^\/gifs\//i, '').split('/');
      const slug = parts[0] || '';
      const slugParts = slug.split('-');
      const gifId = slugParts[slugParts.length - 1];
      if (gifId) {
        return `https://media.giphy.com/media/${gifId}/giphy.gif`;
      }
    }

    // Imgur gifv conversion
    if ((host === 'imgur.com' || host.endsWith('.imgur.com')) && pathname.endsWith('.gifv')) {
      return url.href.replace(/\.gifv$/i, '.gif');
    }

    const isMediaHost = /^media\d*\.giphy\.com$/.test(host) || host === 'i.giphy.com' || host === 'media.tenor.com';

    const isImageExt =
      pathname.endsWith('.gif') ||
      pathname.endsWith('.webp') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.jpeg');

    if (isMediaHost || isImageExt) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a GIF URL from a message object (either attachment or text content).
 */
export function getGifUrlFromMessage(
  msg?: {
    text?: string;
    attachment?: { id: string; name?: string; type?: string };
  } | null
): string | null {
  if (!msg) return null;

  // 1. Check if attachment is a GIF file
  if (msg.attachment) {
    const isGif =
      msg.attachment.type?.toLowerCase() === 'image/gif' ||
      msg.attachment.name?.toLowerCase().endsWith('.gif');
    if (isGif) {
      return api.getFileUrl(msg.attachment.id);
    }
  }

  // 2. Check message text
  if (msg.text) {
    const direct = safeGifUrl(msg.text);
    if (direct) return direct;

    // Check if message embeds a URL
    const matches = msg.text.match(/https?:\/\/[^\s<>'"]+/gi);
    if (matches) {
      for (const candidate of matches) {
        const parsed = safeGifUrl(candidate);
        if (parsed) return parsed;
      }
    }
  }

  return null;
}

/**
 * Reads favorite GIFs list from localStorage.
 */
export function getFavoriteGifs(): string[] {
  try {
    const saved =
      localStorage.getItem(FAVORITE_GIFS_KEY) ||
      localStorage.getItem(LEGACY_SAVED_KEY);
    if (!saved) return [];
    const list = JSON.parse(saved);
    return Array.isArray(list) ? list.filter((value) => typeof value === 'string' && safeGifUrl(value)).slice(0, 100) : [];
  } catch {
    return [];
  }
}

/**
 * Checks if a URL is currently in the favorites list.
 */
export function isGifFavorited(url: string): boolean {
  if (!url) return false;
  const resolved = safeGifUrl(url);
  if (!resolved) return false;
  const list = getFavoriteGifs();
  return list.includes(resolved);
}

/**
 * Saves a GIF URL to favorites and notifies all components.
 */
export function saveGifToFavorites(url: string): boolean {
  const resolved = safeGifUrl(url);
  if (!resolved) { toast.error('Usa uma ligação HTTPS válida para um GIF público.'); return false; }

  try {
    const existing = getFavoriteGifs();
    if (!existing.includes(resolved)) {
      const updated = [resolved, ...existing].slice(0, 100);
      localStorage.setItem(FAVORITE_GIFS_KEY, JSON.stringify(updated));
      localStorage.setItem(LEGACY_SAVED_KEY, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent(FAVORITE_GIFS_EVENT, { detail: updated })
      );
      toast.success('GIF guardado nos teus favoritos');
      return true;
    } else {
      toast.info('Este GIF já está nos teus favoritos');
      return false;
    }
  } catch {
    toast.error('Não foi possível guardar o GIF');
    return false;
  }
}

/**
 * Removes a GIF URL from favorites and notifies all components.
 */
export function removeFavoriteGif(url: string): string[] {
  try {
    const existing = getFavoriteGifs();
    const updated = existing.filter((item) => item !== url);
    localStorage.setItem(FAVORITE_GIFS_KEY, JSON.stringify(updated));
    localStorage.setItem(LEGACY_SAVED_KEY, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent(FAVORITE_GIFS_EVENT, { detail: updated })
    );
    toast.info('GIF removido dos favoritos');
    return updated;
  } catch {
    return [];
  }
}
