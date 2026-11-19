/* Experimenter roster and captured data, stored only in this browser. */
(function (root) {
  'use strict';
  const DB_NAME = 'hyform-experimenter';
  const MEMBERS = 'members', TEAMS = 'teams', MESSAGES = 'messages';
  let database;
  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Experimenter storage failed.'));
    });
  }
  function open() {
    if (database) return Promise.resolve(database);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MEMBERS)) request.result.createObjectStore(MEMBERS, { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains(TEAMS)) request.result.createObjectStore(TEAMS, { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains(MESSAGES)) {
          const messages = request.result.createObjectStore(MESSAGES, { keyPath: 'id' });
          messages.createIndex('channel', 'channel');
        }
      };
      request.onsuccess = () => { database = request.result; resolve(database); };
      request.onerror = () => reject(request.error || new Error('Experimenter storage could not open.'));
    });
  }
  async function list() {
    const db = await open();
    const values = await requestResult(db.transaction(MEMBERS).objectStore(MEMBERS).getAll());
    return values.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  async function put(member) {
    const db = await open();
    await requestResult(db.transaction(MEMBERS, 'readwrite').objectStore(MEMBERS).put(member));
    return member;
  }
  async function update(id, mutator) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MEMBERS, 'readwrite'), store = transaction.objectStore(MEMBERS);
      const request = store.get(id);
      let next;
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('This team member is no longer in the roster.');
          next = mutator(request.result);
          store.put(next);
        } catch (error) { transaction.abort(); reject(error); }
      };
      request.onerror = () => reject(request.error || new Error('Experimenter storage failed.'));
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(transaction.error || new Error('Experimenter storage failed.'));
      transaction.onabort = () => { if (!next) return; reject(transaction.error || new Error('Experimenter storage was cancelled.')); };
    });
  }
  async function remove(id) {
    const db = await open();
    await requestResult(db.transaction(MEMBERS, 'readwrite').objectStore(MEMBERS).delete(id));
  }
  async function listTeams() {
    const db = await open();
    const values = await requestResult(db.transaction(TEAMS).objectStore(TEAMS).getAll());
    return values.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  async function putTeam(team) {
    const db = await open(); await requestResult(db.transaction(TEAMS, 'readwrite').objectStore(TEAMS).put(team)); return team;
  }
  async function removeTeam(id) {
    const db = await open(); await requestResult(db.transaction(TEAMS, 'readwrite').objectStore(TEAMS).delete(id));
  }
  async function listMessages(channel = null) {
    const db = await open(), store = db.transaction(MESSAGES).objectStore(MESSAGES);
    const values = channel ? await requestResult(store.index('channel').getAll(channel)) : await requestResult(store.getAll());
    return values.sort((left, right) => left.sentAt.localeCompare(right.sentAt));
  }
  async function putMessage(message) {
    const db = await open(); await requestResult(db.transaction(MESSAGES, 'readwrite').objectStore(MESSAGES).put(message)); return message;
  }
  async function removeMessages(predicate) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES, 'readwrite'), store = transaction.objectStore(MESSAGES), request = store.getAll();
      request.onsuccess = () => { for (const message of request.result) if (predicate(message)) store.delete(message.id); };
      request.onerror = () => reject(request.error || new Error('Experimenter message storage failed.'));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Experimenter message storage failed.'));
    });
  }
  function removeMessagesForMember(id) { return removeMessages(message => message.senderId === id || message.channel === 'direct:' + id); }
  function removeMessagesForTeam(id) { return removeMessages(message => message.channel === 'team:' + id || message.channel.startsWith('role:' + id + ':')); }
  root.HyformExperimenterStore = { list, put, update, remove, listTeams, putTeam, removeTeam, listMessages, putMessage, removeMessagesForMember, removeMessagesForTeam };
})(globalThis);
