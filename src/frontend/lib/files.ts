/* =========================
   Files
   ========================= */

/* Save a file to the computer (the browser's download), under the given name. */
export function downloadFile(name: string, file: Blob) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* A file as a data address, so it can be kept inside another file (an exported page). */
export function dataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
