export const SIDEBAR_COLLAPSED_KEY = 'am.sidebar.collapsed';
export const SIDEBAR_COLLAPSED_EVENT = 'am:sidebar-collapsed-change';

export function readSidebarCollapsed() {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

export function writeSidebarCollapsed(collapsed: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    window.dispatchEvent(new CustomEvent(SIDEBAR_COLLAPSED_EVENT, { detail: { collapsed } }));
}
