import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * 离线存储管理器 - 使用IndexedDB缓存数据
 */
export class OfflineStorage {
  static DB_NAME = 'SoulSentryOffline';
  static DB_VERSION = 1;
  static STORES = {
    tasks: 'tasks',
    notes: 'notes',
    syncQueue: 'syncQueue'
  };

  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建对象存储
        if (!db.objectStoreNames.contains(this.STORES.tasks)) {
          const taskStore = db.createObjectStore(this.STORES.tasks, { keyPath: 'id' });
          taskStore.createIndex('status', 'status', { unique: false });
          taskStore.createIndex('updated_date', 'updated_date', { unique: false });
        }

        if (!db.objectStoreNames.contains(this.STORES.notes)) {
          const noteStore = db.createObjectStore(this.STORES.notes, { keyPath: 'id' });
          noteStore.createIndex('updated_date', 'updated_date', { unique: false });
        }

        if (!db.objectStoreNames.contains(this.STORES.syncQueue)) {
          db.createObjectStore(this.STORES.syncQueue, { keyPath: 'timestamp', autoIncrement: true });
        }
      };
    });
  }

  // 保存任务到离线存储
  static async saveTasks(tasks) {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.tasks], 'readwrite');
    const store = transaction.objectStore(this.STORES.tasks);

    for (const task of tasks) {
      store.put(task);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // 获取离线任务
  static async getTasks() {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.tasks], 'readonly');
    const store = transaction.objectStore(this.STORES.tasks);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 保存心签到离线存储
  static async saveNotes(notes) {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.notes], 'readwrite');
    const store = transaction.objectStore(this.STORES.notes);

    for (const note of notes) {
      store.put(note);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // 获取离线心签
  static async getNotes() {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.notes], 'readonly');
    const store = transaction.objectStore(this.STORES.notes);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 添加到同步队列
  static async addToSyncQueue(operation) {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.syncQueue], 'readwrite');
    const store = transaction.objectStore(this.STORES.syncQueue);

    const queueItem = {
      ...operation,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.add(queueItem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 获取同步队列
  static async getSyncQueue() {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.syncQueue], 'readonly');
    const store = transaction.objectStore(this.STORES.syncQueue);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 清空同步队列
  static async clearSyncQueue() {
    const db = await this.openDB();
    const transaction = db.transaction([this.STORES.syncQueue], 'readwrite');
    const store = transaction.objectStore(this.STORES.syncQueue);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * 离线管理Hook
 */
export function useOfflineManager() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineChanges();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 初始化时检查是否有待同步数据
    checkPendingSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkPendingSync = async () => {
    try {
      const queue = await OfflineStorage.getSyncQueue();
      setPendingSync(queue.length);
    } catch (error) {
      console.error('Failed to check sync queue:', error);
    }
  };

  const syncOfflineChanges = async () => {
    try {
      const queue = await OfflineStorage.getSyncQueue();
      
      for (const item of queue) {
        try {
          switch (item.type) {
            case 'create_task':
              await base44.entities.Task.create(item.data);
              break;
            case 'update_task':
              await base44.entities.Task.update(item.id, item.data);
              break;
            case 'delete_task':
              await base44.entities.Task.delete(item.id);
              break;
            case 'create_note':
              await base44.entities.Note.create(item.data);
              break;
            case 'update_note':
              await base44.entities.Note.update(item.id, item.data);
              break;
            case 'delete_note':
              await base44.entities.Note.delete(item.id);
              break;
          }
        } catch (error) {
          console.error('Failed to sync item:', item, error);
        }
      }

      await OfflineStorage.clearSyncQueue();
      setPendingSync(0);
    } catch (error) {
      console.error('Failed to sync offline changes:', error);
    }
  };

  return {
    isOnline,
    pendingSync,
    syncOfflineChanges
  };
}