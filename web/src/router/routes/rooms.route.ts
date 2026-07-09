import RoomsView from '@/modules/rooms/RoomsView.vue'
import RoomsIntro from '@/modules/rooms/RoomsIntro.vue'
import RoomDetail from '@/modules/rooms/RoomDetail.vue'

export default {
  path: '/rooms',
  children: [
    {
      path: '',
      name: 'rooms',
      components: {
        intro: RoomsIntro,
        default: RoomsView,
      },
    },
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
