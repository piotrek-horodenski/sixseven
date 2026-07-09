import ImagesView from '@/modules/images/ImagesView.vue'
import ImagesSubmenu from '@/modules/images/ImagesSubmenu.vue'
import ImagesSidebar from '@/modules/images/ImagesSidebar.vue'
import ImagesIntro from '@/modules/images/ImagesIntro.vue'
import ImagesToolbar from '@/modules/images/ImagesToolbar.vue'
import ImageEditPanel from '@/modules/images/ImageEditPanel.vue'
import ImagesBatchPanel from '@/modules/images/ImagesBatchPanel.vue'
import ImagesBatchFooter from '@/modules/images/ImagesBatchFooter.vue'

export default {
  path: '/images',
  meta: { requiredPermission: 'access-images' },
  children: [
    {
      path: '',
      name: 'images',
      components: { intro: ImagesIntro, controls: ImagesToolbar, default: ImagesView, submenu: ImagesSubmenu, sidebar: ImagesSidebar, footer: ImagesBatchFooter },
      meta: {
        requiredPermission: 'access-images',
      },
    },
    {
      path: 'batch',
      name: 'images-batch',
      components: { intro: ImagesIntro, controls: ImagesToolbar, default: ImagesView, submenu: ImagesSubmenu, sidebar: ImagesSidebar, aside: ImagesBatchPanel, footer: ImagesBatchFooter },
      meta: {
        requiredPermission: 'access-images',
      },
    },
    {
      path: ':id',
      name: 'images-edit',
      components: { intro: ImagesIntro, controls: ImagesToolbar, default: ImagesView, submenu: ImagesSubmenu, sidebar: ImagesSidebar, aside: ImageEditPanel, footer: ImagesBatchFooter },
      meta: {
        requiredPermission: 'access-images',
      },
    },
  ],
}
