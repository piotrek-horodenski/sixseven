<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSocialStore } from '@/stores/social/social.store'
import { useGateStore } from '@/stores/gate/gate.store'
import { dmChannel } from '@/stores/social/chat.model'
import FriendStatusDot from './FriendStatusDot.vue'
import ChatAsidePanel from './ChatAsidePanel.vue'

/**
 * Panel znajomych (slot `aside`). Lista znajomych ze wskaźnikiem obecności live
 * (subskrypcja `presence`), sekcja zaproszeń przychodzących (Przyjmij/Odrzuć)
 * oraz pole „dodaj po nazwie/ID" → `friends:invite`. Klik w znajomego otwiera
 * czat 1:1 (DM). Stan zasila `social.store` (refcount lifecycle).
 */

const store = useSocialStore()
const gate = useGateStore()
const inviteTarget = ref('')

/** Otwarty DM (klik w znajomego) — `null` = widok listy. */
const dmWith = ref<{ userId: string; nick: string } | null>(null)
const dmScopeId = computed<string | null>(() => {
  const me = gate.user?._id
  if (!me || !dmWith.value) return null
  return dmChannel(me, dmWith.value.userId)
})

function openDm(friend: { userId: string; nick: string }) {
  dmWith.value = { userId: friend.userId, nick: friend.nick }
}

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
  <!-- Widok DM 1:1 (klik w znajomego) -->
  <template v-if="dmWith">
    <div class="friends-panel__header friends-panel__dm-header">
      <button
        type="button"
        class="friends-panel__back"
        :aria-label="$t('social.panel.title')"
        @click="dmWith = null"
      >
        <fa icon="caret-left" />
      </button>
      <h3 class="friends-panel__title">{{ dmWith.nick }}</h3>
      <RouterLink
        class="friends-panel__dm-profile"
        :to="`/u/${dmWith.userId}`"
        :title="$t('social.actions.profile')"
        :aria-label="$t('social.actions.profile')"
      >
        <fa icon="user" />
      </RouterLink>
    </div>
    <ChatAsidePanel scope="dm" :scope-id="dmScopeId" />
  </template>

  <!-- Widok listy znajomych -->
  <template v-else>
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
        <RouterLink class="friend-invite__name friend-invite__name--link" :to="`/u/${inv.userId}`">
          {{ inv.nick }}
        </RouterLink>
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
        <button
          type="button"
          class="friend-row__name friend-row__name--btn"
          :title="$t('social.actions.message')"
          @click="openDm(friend)"
        >{{ friend.nick }}</button>
        <span class="friend-row__status">{{ $t(`social.status.${friend.status}`) }}</span>
        <RouterLink
          class="friend-row__profile"
          :to="`/u/${friend.userId}`"
          :title="$t('social.actions.profile')"
          :aria-label="$t('social.actions.profile')"
        >
          <fa icon="user" />
        </RouterLink>
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
        <span class="friend-row__name">{{ inv.nick }}</span>
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
  </template>
</div>
</template>
