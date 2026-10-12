import { isEmoji } from '../../../shared/emoji';
import { storedImageBlock } from '../editor/images/images';


/* =========================
   Imported Notes
   ========================= */

/* Turns a key the file uses for one of its notes into that note's new id (undefined for a note */
/* the file does not hold). */
export type IdOf = (key: string) => string | undefined;

/* One note read from a file. key is how the file refers to it, so links between the notes of one */
/* file can lead to the new notes. category is a category's name, kept only when one has that name. */
export type ImportedNote = {
  key: string;
  title: string;
  icon?: string;
  description?: string;
  category?: string;

  /* Remarks and text as note HTML. Text is made once every note has its id, for the links. */
  remarks?: string;
  content: (idOf: IdOf) => Promise<string> | string;
};

/* A problem with a file, explained in words the person can act on. */
export class ImportError extends Error {}


/* =========================
   Shared Helpers
   ========================= */

/* The note title a file gives when it has none of its own: its name without the extension. */
export function fileTitle(name: string) {
  return name.replace(/\.[^.]+$/, '').trim() || 'Imported note';
}

/* A title that starts with an emoji, as Starjot writes a note's icon before its title. */
export function splitIcon(heading: string) {
  const [first, ...rest] = heading.trim().split(/\s+/);
  return first && rest.length && isEmoji(first) ? { icon: first, title: rest.join(' ') } : { icon: '', title: heading.trim() };
}

/* Keep the pictures written into the HTML as data addresses (as Starjot's own exports do), and */
/* put an image block in place of each. Pictures on the web are left out, so importing never */
/* reaches out to other websites. A block that names an image keeps its width and alignment. */
export async function keepPictures(root: Element) {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async picture => {
    const blob = dataBlob(picture.getAttribute('src') ?? '');
    const holder = picture.closest<HTMLElement>('.image-block');
    if (!blob) {
      (holder ?? picture).remove();
      return;
    }
    const block = await storedImageBlock(blob);
    if (holder?.dataset.width) block.dataset.width = holder.dataset.width;
    if (holder?.dataset.align) block.dataset.align = holder.dataset.align;
    (holder ?? picture).replaceWith(block);
  }));
}

/* The picture in a data address (data:image/png;base64,…), or null for anything else. */
export function dataBlob(address: string) {
  const match = address.match(/^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}
