import ConceptsView from '@/modules/concepts/ConceptsView.vue'
import ConceptsSubmenu from '@/modules/concepts/ConceptsSubmenu.vue'
import ConceptsIntro from '@/modules/concepts/ConceptsIntro.vue'
import ProjectsView from '@/modules/projects/ProjectsView.vue'
import ProjectsSubmenu from '@/modules/projects/ProjectsSubmenu.vue'
import ProjectsSidebar from '@/modules/projects/ProjectsSidebar.vue'
import ProjectsIntro from '@/modules/projects/ProjectsIntro.vue'
import ProjectDetailView from '@/modules/projects/ProjectDetailView.vue'
import ProjectDetailSubmenu from '@/modules/projects/ProjectDetailSubmenu.vue'
import ProjectDetailSidebar from '@/modules/projects/ProjectDetailSidebar.vue'
import ProjectOverview from '@/modules/projects/sections/ProjectOverview.vue'
import ProjectStudio from '@/modules/projects/sections/ProjectStudio.vue'
import ProjectBoards from '@/modules/projects/sections/ProjectBoards.vue'
import ProjectPlaylists from '@/modules/projects/sections/ProjectPlaylists.vue'
import ProjectDatasets from '@/modules/projects/sections/ProjectDatasets.vue'
import ProjectEnvironment from '@/modules/projects/sections/ProjectEnvironment.vue'

export default {
  path: '/concepts',
  meta: { requiredPermission: 'access-unreal-projects' },
  children: [
    {
      path: '',
      name: 'concepts',
      components: { intro: ConceptsIntro, default: ConceptsView, submenu: ConceptsSubmenu },
      meta: {
        requiredPermission: 'access-unreal-projects',
      },
    },
    {
      path: ':concept/projects',
      name: 'concept-projects',
      components: { intro: ProjectsIntro, default: ProjectsView, submenu: ProjectsSubmenu, sidebar: ProjectsSidebar },
      meta: {
        requiredPermission: 'access-unreal-projects',
      },
    },
    {
      path: ':concept/projects/:projectId',
      components: { intro: ProjectsIntro, default: ProjectDetailView, submenu: ProjectDetailSubmenu, sidebar: ProjectDetailSidebar },
      meta: {
        requiredPermission: 'access-unreal-projects',
      },
      children: [
        {
          path: '',
          redirect: 'overview',
        },
        {
          path: 'overview',
          name: 'project-overview',
          component: ProjectOverview,
          meta: { requiredPermission: 'access-unreal-projects' },
        },
        {
          path: 'studio',
          name: 'project-studio',
          component: ProjectStudio,
          meta: { requiredPermission: 'access-unreal-projects' },
        },
        {
          path: 'boards',
          name: 'project-boards',
          component: ProjectBoards,
          meta: { requiredPermission: 'access-unreal-projects' },
        },
        {
          path: 'playlists',
          name: 'project-playlists',
          component: ProjectPlaylists,
          meta: { requiredPermission: 'access-unreal-projects' },
        },
        {
          path: 'datasets',
          name: 'project-datasets',
          component: ProjectDatasets,
          meta: { requiredPermission: 'access-unreal-projects' },
        },
        {
          path: 'environment',
          name: 'project-environment',
          component: ProjectEnvironment,
          meta: { requiredPermission: 'access-unreal-projects' },
        },
      ],
    },
  ],
}
