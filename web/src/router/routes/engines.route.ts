import EnginesView from '@/modules/engines/EnginesView.vue'
import ClustersView from '@/modules/engines/ClustersView.vue'
import EnginesSubmenu from '@/modules/engines/EnginesSubmenu.vue'
import EnginesIntro from '@/modules/engines/EnginesIntro.vue'
import ClustersIntro from '@/modules/engines/ClustersIntro.vue'
import EngineDetailPanel from '@/modules/engines/EngineDetailPanel.vue'
import EnginesSidebar from '@/modules/engines/EnginesSidebar.vue'
import ClusterIntro from '@/modules/engines/ClusterIntro.vue'
import EngineLogsIntro from '@/modules/engines/EngineLogsIntro.vue'
import EngineLogsView from '@/modules/engines/EngineLogsView.vue'
import EngineErrorsIntro from '@/modules/engines/EngineErrorsIntro.vue'
import EngineErrorsView from '@/modules/engines/EngineErrorsView.vue'

export default {
  path: '/engines',
  redirect: '/engines/list',
  meta: { requiredPermission: 'manage-engines' },
  children: [
    {
      path: 'list',
      name: 'engines',
      components: { intro: EnginesIntro, default: EnginesView, submenu: EnginesSubmenu },
      meta: {
        requiredPermission: 'manage-engines',
        animation: {
          intro: {
            'clusters': 'slide-right',
            'cluster-detail': 'slide-right',
          },
          default: {
            'clusters': 'slide-right',
          },
        },
      },
    },
    {
      path: 'list/:id',
      name: 'engine-detail',
      components: { intro: EnginesIntro, default: EnginesView, submenu: EnginesSubmenu, aside: EngineDetailPanel },
      meta: {
        requiredPermission: 'manage-engines',
      },
    },
    {
      path: 'clusters',
      name: 'clusters',
      components: { intro: ClustersIntro, default: ClustersView, submenu: EnginesSubmenu, sidebar: EnginesSidebar },
      meta: {
        requiredPermission: 'manage-engines',
        animation: {
          intro: {
            'engines': 'slide-left',
            'engine-detail': 'slide-left',
          },
          default: {
            'engines': 'slide-left',
          },
        },
      },
    },
    {
      path: 'clusters/:id',
      name: 'cluster-detail',
      components: { default: ClustersView, submenu: EnginesSubmenu, sidebar: EnginesSidebar, intro: ClusterIntro },
      meta: {
        requiredPermission: 'manage-engines',
      },
    },
    {
      path: 'logs/:id',
      name: 'engine-logs',
      components: { intro: EngineLogsIntro, default: EngineLogsView, submenu: EnginesSubmenu },
      meta: {
        requiredPermission: 'manage-engines',
      },
    },
    {
      path: 'errors/:id',
      name: 'engine-errors',
      components: { intro: EngineErrorsIntro, default: EngineErrorsView, submenu: EnginesSubmenu },
      meta: {
        requiredPermission: 'manage-engines',
      },
    },
  ],
}
