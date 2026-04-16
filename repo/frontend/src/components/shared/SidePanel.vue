<template>
  <Teleport to="body">
    <Transition name="panel">
      <div v-if="modelValue" class="side-panel-overlay" @click.self="handleClose">
        <div
          class="side-panel"
          role="dialog"
          :aria-label="title"
          aria-modal="true"
          data-testid="side-panel"
        >
          <div class="panel-header">
            <h3 class="panel-title">{{ title }}</h3>
            <button class="panel-close" @click="handleClose" aria-label="Close panel">×</button>
          </div>
          <div class="panel-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="panel-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  closeOnOverlay?: boolean;
}>(), {
  // Keep default behavior intuitive: clicking overlay closes unless explicitly disabled.
  closeOnOverlay: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function handleClose() {
  if (props.closeOnOverlay) {
    emit('update:modelValue', false);
  }
}
</script>

<style scoped>
.side-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 500;
  display: flex;
  justify-content: flex-end;
}

.side-panel {
  background: #fff;
  width: 480px;
  max-width: 100vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.panel-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: #111827;
}

.panel-close {
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: #9ca3af;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.panel-close:hover {
  color: #374151;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.panel-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* Transition */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
}

.panel-enter-active .side-panel,
.panel-leave-active .side-panel {
  transition: transform 0.2s;
}
.panel-enter-from .side-panel,
.panel-leave-to .side-panel {
  transform: translateX(100%);
}
</style>
