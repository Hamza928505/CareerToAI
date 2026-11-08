// Keep old browser drafts recoverable after the editor moves to another origin.
const button = document.querySelector('[data-export-draft]');
const status = document.querySelector('[data-export-status]');

button.addEventListener('click', async () => {
  button.disabled = true;
  let db;
  try {
    const saved = localStorage.getItem('careertoai:v1');
    if (!saved) {
      status.textContent = 'No old draft was found in this browser at this address.';
      return;
    }
    const state = JSON.parse(saved);
    const images = {};
    const keys = [...new Set([...(state.experience || []), ...(state.projects || []), ...(state.certificates || [])]
      .map(item => item.imageKey).filter(Boolean))];
    if (keys.length) {
      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('careertoai', 1);
        request.onupgradeneeded = () => { request.transaction.abort(); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('The old attachment storage could not be opened. Your draft has not changed.'));
      });
      for (const key of keys) {
        const record = await new Promise((resolve, reject) => {
          const request = db.transaction('images', 'readonly').objectStore('images').get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (!record) throw new Error('An attachment is missing. Your draft has not changed; recover the attachment before exporting.');
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(record.blob);
        });
        images[key] = { name: record.name, type: record.type, dataUrl };
      }
    }
    const payload = { ...state, version: 1, exportedAt: new Date().toISOString(), images };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'careertoai-data.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Downloaded. Use Load .json in the GJUBoard editor. Your old draft is still here.';
  } catch (error) {
    status.textContent = `Could not export: ${error.message}`;
  } finally {
    db?.close();
    button.disabled = false;
  }
});
