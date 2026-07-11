import RoomsIntro from '@/modules/rooms/RoomsIntro.vue'
import RoomDetail from '@/modules/rooms/RoomDetail.vue'

// Lista pokoi (dawne `/rooms`) przeniesiona do Home (`/`) — hub kafelków.
// Zostaje tylko wejście do konkretnego pokoju.
export default {
  path: '/rooms',
  children: [
    {
      path: ':id',
      name: 'rooms-detail',
      components: {
        intro: RoomsIntro,
        default: RoomDetail,
      },
    },
  ],
}
