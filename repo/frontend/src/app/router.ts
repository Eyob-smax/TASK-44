import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { authGuard } from './guards/auth.guard.js';

// Extend RouteMeta to carry typed guard fields
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiredPermission?: string;
    requiredRoles?: string[];
    title?: string;
  }
}

const routes: RouteRecordRaw[] = [
  // ---- Public ----
  {
    path: '/login',
    name: 'login',
    component: () => import('./views/LoginView.vue'),
    meta: { title: 'Sign In' },
  },

  // ---- App shell (authenticated) ----
  {
    path: '/',
    component: () => import('./layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: { name: 'dashboard' },
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../modules/dashboard/DashboardView.vue'),
        meta: { requiresAuth: true, title: 'Dashboard' },
      },
      {
        path: 'classroom-ops',
        name: 'classroom-ops',
        component: () => import('../modules/classroom-ops/ClassroomOpsView.vue'),
        meta: {
          requiresAuth: true,
          requiredPermission: 'read:classroom-ops:*',
          title: 'Classroom Ops',
        },
      },
      {
        path: 'parking',
        name: 'parking',
        component: () => import('../modules/parking/ParkingView.vue'),
        meta: {
          requiresAuth: true,
          requiredPermission: 'read:parking:*',
          title: 'Parking',
        },
      },
      {
        path: 'fulfillment',
        name: 'fulfillment',
        component: () => import('../modules/fulfillment/FulfillmentView.vue'),
        meta: {
          requiresAuth: true,
          requiredPermission: 'read:logistics:*',
          title: 'Fulfillment & Logistics',
        },
      },
      {
        path: 'after-sales',
        name: 'after-sales',
        component: () => import('../modules/after-sales/AfterSalesView.vue'),
        meta: {
          requiresAuth: true,
          requiredPermission: 'read:after-sales:*',
          title: 'After-Sales',
        },
      },
      {
        path: 'memberships',
        name: 'memberships',
        component: () => import('../modules/memberships/MembershipsView.vue'),
        meta: {
          requiresAuth: true,
          requiredPermission: 'read:memberships:*',
          title: 'Memberships & Commerce',
        },
      },
      {
        path: 'admin',
        name: 'admin',
        component: () => import('../modules/admin/AdminView.vue'),
        meta: {
          requiresAuth: true,
          requiredRoles: ['Administrator', 'OpsManager', 'Auditor'],
          title: 'Admin / Master Data',
        },
      },
      {
        path: 'observability',
        name: 'observability',
        component: () => import('../modules/observability/ObservabilityView.vue'),
        meta: {
          requiresAuth: true,
          requiredPermission: 'read:observability:*',
          title: 'Observability',
        },
      },
    ],
  },

  // ---- Error pages ----
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('./views/ForbiddenView.vue'),
    meta: { title: 'Access Denied' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('./views/NotFoundView.vue'),
    meta: { title: 'Page Not Found' },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(authGuard);

// Set document title from route meta
router.afterEach((to) => {
  const title = to.meta.title;
  document.title = title ? `${title} — CampusOps` : 'CampusOps';
});
