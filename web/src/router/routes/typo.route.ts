import Typo from '@/modules/typography/TypographyView.vue'
import TypographyMessages from '@/modules/typography/TypographyMessages.vue'
import TypographyIntro from '@/modules/typography/TypographyIntro.vue'

export default {
  path: '/typo',
  name: 'typo',
  components: {
    intro: TypographyIntro,
    messages: TypographyMessages,
    default: Typo,
  },
  meta: {
    animation: {
      intro: {
        controls: 'slide-up',
        typo2: 'slide-right',
      },
      default: {
        home: 'slide-left',
        controls: 'slide-down',
      },
    },
  },
}
