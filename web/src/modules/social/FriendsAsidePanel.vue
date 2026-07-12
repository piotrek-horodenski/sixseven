<script setup lang="ts">

import { ref, onMounted, onUnmounted } from 'vue'
import { useSocialStore } from '@/stores/social/social.store'
import FriendStatusDot from './FriendStatusDot.vue'

/**
 * Panel znajomych (slot `aside`). Lista znajomych ze wskaźnikiem obecności live
 * (subskrypcja `presence`), sekcja zaproszeń przychodzących (Przyjmij/Odrzuć)
 * oraz pole „dodaj po nazwie/ID" → `friends:invite`. Stan zasila
 * `social.store` (refcount lifecycle — bezpieczne z innymi konsumentami).
 */

const store = useSocialStore()
const inviteTarget = ref('')

function submitInvite() {
  const target = inviteTarget.value.trim()
  if (!target) return
  store.invite(target)
  inviteTarget.value = ''
}

onMounted(() => store.init())
onUnmounted(() => store.cleanup())

</script>
<template>
<div class="friends-panel">
  <div class="friends-panel__header">
    <h3 class="friends-panel__title">
      <fa icon="user-friends" class="friends-panel__icon" /> {{ $t('social.panel.title') }}
    </h3>
  </div>

  <form class="friends-panel__add" @submit.prevent="submitInvite">
    <UiInput
      v-model="inviteTarget"
      :placeholder="$t('social.panel.addPlaceholder')"
    />
    <UiButton class="accent" type="submit" :disabled="!inviteTarget.trim()">
      {{ $t('social.actions.invite') }}
    </UiButton>
  </form>

  <p v-if="store.lastError" class="friends-panel__error">{{ store.lastError }}</p>

  <section
    v-if="store.pendingIncoming.length"
    class="friends-panel__section friends-panel__section--invites"
  >
    <h4 class="friends-panel__section-title">{{ $t('social.invites.title') }}</h4>
    <ul class="friends-panel__list">
      <li
        v-for="inv in store.pendingIncoming"
        :key="inv.friendshipId"
        class="friend-invite"
      >
        <span class="friend-invite__name">{{ inv.userId }}</span>
        <div class="friend-invite__actions">
          <UiButton class="accent" @click="store.accept(inv.userId)">
            {{ $t('social.actions.accept') }}
          </UiButton>
          <UiButton @click="store.remove(inv.userId)">
            {{ $t('social.actions.reject') }}
          </UiButton>
        </div>
      </li>
    </ul>
  </section>

  <section class="friends-panel__section">
    <ul v-if="store.friends.length" class="friends-panel__list">
      <li
        v-for="friend in store.friends"
        :key="friend.friendshipId"
        class="friend-row"
      >
        <FriendStatusDot :status="friend.status" />
        <span class="friend-row__name">{{ friend.userId }}</span>
        <span class="friend-row__status">{{ $t(`social.status.${friend.status}`) }}</span>
        <button
          class="friend-row__remove"
          type="button"
          :title="$t('social.actions.remove')"
          :aria-label="$t('social.actions.remove')"
          @click="store.remove(friend.userId)"
        >
          <fa icon="times" />
        </button>
      </li>
    </ul>

    <p
      v-else-if="!store.pendingIncoming.length"
      class="friends-panel__empty"
    >
      {{ $t('social.panel.empty') }}
    </p>
  </section>

  <section
    v-if="store.pendingOutgoing.length"
    class="friends-panel__section friends-panel__section--outgoing"
  >
    <h4 class="friends-panel__section-title">{{ $t('social.invites.outgoingTitle') }}</h4>
    <ul class="friends-panel__list">
      <li
        v-for="inv in store.pendingOutgoing"
        :key="inv.friendshipId"
        class="friend-row friend-row--pending"
      >
        <span class="friend-row__name">{{ inv.userId }}</span>
        <span class="friend-row__status">{{ $t('social.invites.pending') }}</span>
        <button
          class="friend-row__remove"
          type="button"
          :title="$t('social.actions.remove')"
          :aria-label="$t('social.actions.remove')"
          @click="store.remove(inv.userId)"
        >
          <fa icon="times" />
        </button>
      </li>
    </ul>
  </section>
</div>
</template>
