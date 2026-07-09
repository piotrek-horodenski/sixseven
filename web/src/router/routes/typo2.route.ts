import Typo from '@/modules/typography/TypographyView.vue'
import TypographyMessages from '@/modules/typography/TypographyMessages.vue'
import Typography2Intro from '@/modules/typography/Typography2Intro.vue'

export default {
  path: '/typo2',
  name: 'typo2',
  components: {
    intro: Typography2Intro,
    messages: TypographyMessages,
    default: Typo,
  },
  meta: {
    animation: {
      intro: {
        controls: 'slide-left',
        typo: 'slide-left',
      },
      default: {
        home: 'slide-left',
        controls: 'slide-down',
      },
    },
  },
}
