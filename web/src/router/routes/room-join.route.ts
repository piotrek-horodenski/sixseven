import RoomJoinView from '@/modules/rooms/RoomJoinView.vue'

export default {
  path: '/r/:code',
  name: 'room-join',
  component: RoomJoinView,
  // `open`: dostępna dla wszystkich (zalogowany i gość) bez redirectu.
  // `public`: App.vue renderuje ją standalone (poza AppLayout).
  meta: { public: true, open: true },
}
