import { defineStore } from 'pinia';
import { ref } from 'vue';

export type NotificationSeverity = 'success' | 'info' | 'warn' | 'error';

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  summary: string;
  detail?: string;
  life?: number;
}

export const useUiStore = defineStore('ui', () => {
  const notifications = ref<AppNotification[]>([]);
  const globalLoading = ref(false);

  function addNotification(n: Omit<AppNotification, 'id'>) {
    const notification: AppNotification = {
      id: crypto.randomUUID(),
      life: 4000,
      ...n,
    };
    notifications.value.push(notification);
    if (notification.life) {
      setTimeout(() => removeNotification(notification.id), notification.life);
    }
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id);
  }

  function notifySuccess(summary: string, detail?: string) {
    addNotification({ severity: 'success', summary, detail });
  }

  function notifyError(summary: string, detail?: string) {
    addNotification({ severity: 'error', summary, detail, life: 6000 });
  }

  function notifyWarn(summary: string, detail?: string) {
    addNotification({ severity: 'warn', summary, detail });
  }

  return {
    notifications,
    globalLoading,
    addNotification,
    removeNotification,
    notifySuccess,
    notifyError,
    notifyWarn,
  };
});
