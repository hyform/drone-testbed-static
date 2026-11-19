(function (root) {
  'use strict';
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('hyform-static-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Browser storage is unavailable. Enable site storage to use HyForm.'));
    });
    return connection;
  }
  async function update(mutator) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const read = store.get('active');
      let result;
      read.onsuccess = () => {
        try {
          result = mutator(read.result || HyformProject.newProject());
          store.put(result, 'active');
        } catch (error) { reject(error); tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Could not save this project in the browser.'));
      tx.onabort = () => reject(tx.error || new Error('The project was not changed.'));
    });
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').get('active');
      request.onsuccess = () => resolve(request.result || HyformProject.newProject());
      request.onerror = () => reject(request.error);
    });
  }
  root.HyformStore = { read, update };
})(globalThis);
