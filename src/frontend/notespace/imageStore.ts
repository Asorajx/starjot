/* =========================
   Image Store
   ========================= */

/* Notes never hold image files, only an image's id (see editor/images.ts). The files live in an */
/* image store. Today that is the browser's own database (IndexedDB), which holds far more than */
/* the browser storage used for notes. Other places (a local folder, Google Drive, a Starjot */
/* server) can be added later by writing another ImageStore with the same four functions. */
export type ImageStore = {
  save: (id: string, file: Blob) => Promise<void>;
  load: (id: string) => Promise<Blob | null>;
  remove: (id: string) => Promise<void>;
  ids: () => Promise<string[]>;
};

const DATABASE = 'starjot-images';
const TABLE = 'images';

/* Image ids look like img_lq2x9k_ab12cd; the sanitizer only keeps ids of this shape. */
export const IMAGE_ID = /^img_[a-z0-9_]{1,60}$/;

export function newImageId() {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

let database: Promise<IDBDatabase> | null = null;

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TABLE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

/* Run one request against the images table and wait for its result. */
async function run<T>(mode: IDBTransactionMode, action: (table: IDBObjectStore) => IDBRequest<T>) {
  const table = (await openDatabase()).transaction(TABLE, mode).objectStore(TABLE);
  return new Promise<T>((resolve, reject) => {
    const request = action(table);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const browserStore: ImageStore = {
  save: async (id, file) => { await run('readwrite', table => table.put(file, id)); },
  load: async id => (await run<Blob | undefined>('readonly', table => table.get(id))) ?? null,
  remove: async id => { await run('readwrite', table => table.delete(id)); },
  ids: async () => (await run('readonly', table => table.getAllKeys())).map(String)
};

const store: ImageStore = browserStore;

/* Web addresses for loaded images, made once per image, so every copy of it shares one. */
const urls = new Map<string, Promise<string | null>>();


/* =========================
   Using Images
   ========================= */

/* Keep an image file and return its new id. */
export async function saveImage(file: Blob) {
  const id = newImageId();
  await store.save(id, file);
  return id;
}

export function loadImage(id: string) {
  return store.load(id).catch(() => null);
}

/* An address an <img> can show the image from, or null when the image is not in the store */
/* (for example a note copied from another browser). */
export function imageUrl(id: string) {
  let url = urls.get(id);
  if (!url) {
    url = loadImage(id).then(file => (file ? URL.createObjectURL(file) : null));
    urls.set(id, url);
  }
  return url;
}

/* Remove images that no note uses any more. Run once when the app opens, so undo during a visit */
/* can still bring back an image that was just deleted. */
export async function removeUnusedImages(used: Set<string>) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const stored = await store.ids();
    await Promise.all(stored.filter(id => !used.has(id)).map(id => store.remove(id)));
  } catch {
    /* Without the browser's database there is nothing to clean up. */
  }
}
