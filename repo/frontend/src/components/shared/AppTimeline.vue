<template>
  <div class="timeline" data-testid="timeline">
    <div
      v-for="entry in entries"
      :key="entry.id"
      :class="['timeline-entry', `timeline-entry--${entry.type}`]"
      data-testid="timeline-entry"
    >
      <div class="timeline-dot" aria-hidden="true" />
      <div class="timeline-body">
        <div class="timeline-meta">
          <span class="timeline-type">{{ formatType(entry.type) }}</span>
          <span class="timeline-time">{{ formatDate(entry.createdAt) }}</span>
        </div>
        <p class="timeline-content">{{ entry.content }}</p>
        <span v-if="entry.userId" class="timeline-user">by {{ entry.userId }}</span>
      </div>
    </div>

    <div v-if="entries.length === 0" class="timeline-empty" data-testid="timeline-empty">
      No timeline entries yet.
    </div>
  </div>
</template>

<script setup lang="ts">
export interface TimelineEntry {
  id: string;
  type: string;
  content: string;
  userId?: string;
  createdAt: string;
}

defineProps<{
  entries: TimelineEntry[];
}>();

function formatType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
  padding-left: 1.25rem;
  border-left: 2px solid #e5e7eb;
}

.timeline-entry {
  position: relative;
  padding: 0 0 1.25rem 1.25rem;
}

.timeline-dot {
  position: absolute;
  left: -1.5rem;
  top: 0.3rem;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: #6495ed;
  border: 2px solid #fff;
}

.timeline-entry--created .timeline-dot { background: #22c55e; }
.timeline-entry--resolved .timeline-dot { background: #a855f7; }
.timeline-entry--status_change .timeline-dot { background: #f59e0b; }
.timeline-entry--compensation .timeline-dot { background: #ef4444; }
.timeline-entry--evidence_added .timeline-dot { background: #06b6d4; }

.timeline-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.2rem;
}

.timeline-type {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #374151;
}

.timeline-time {
  font-size: 0.75rem;
  color: #9ca3af;
}

.timeline-content {
  font-size: 0.875rem;
  color: #4b5563;
  margin: 0 0 0.15rem;
  line-height: 1.4;
}

.timeline-user {
  font-size: 0.75rem;
  color: #9ca3af;
}

.timeline-empty {
  padding: 1rem 0;
  font-size: 0.875rem;
  color: #9ca3af;
}
</style>
