// @ts-nocheck
import { VERSION, CONSTANTS, SVG_ICONS } from "../constants";
import { LOG, UEP_LOG, setDebugFlag } from "../core/logger";
import { Utils } from "../utils";
import { Settings, SETTINGS_SECTIONS, SettingChange } from "../settings";
import { DownloadManager } from "../services/download-manager";
import { CourseExtractor } from "../services/course-extractor";
import { NotificationManager } from "../services/notification-manager";
import { HomeworkModule } from "./homework/module";
import { SettingsPanel } from "./settings/panel";
import { isCourseRoute, isNotificationRoute } from "./routing";
import { handleCoursesPage as handleCoursesPageFlow } from "./pages/course-list";
import { handleCourseHome as handleCourseHomeFlow } from "./pages/course-detail";
import { handleNotificationPage as handleNotificationPageFlow } from "./pages/notification";
import {
  CourseResourceContext,
  resolveSingleFileName as resolveCourseResourceFileName,
} from "./pages/course-resources";
import { API, AssignmentSummary, UndoneListResponse } from "../core/api";
import { Storage, StoredCourseInfo } from "../core/storage";

export class UCloudEnhancer {
  private downloadManager: DownloadManager;
  private courseExtractor: CourseExtractor;
  private currentPage: string;
  private homework: HomeworkModule;
  private settingsPanel: SettingsPanel;
  private observers: Set<{ disconnect?: () => void }>;
  private isBatchDownloading: boolean;
  private _injectedStyles: Set<string>;
  private _themeActive: boolean;
  private _unlockCopyBound: boolean;
  private _imageViewerCleanup: (() => void) | null;
  private _courseExtractorRetryTimer: number | null;
  private _notificationMarkReadHandler: ((event: Event) => void) | null;
  private _notificationObserver: MutationObserver | null;
  private _simplifyStylesInjected: boolean;
  private _homeSimplifyCleanup: (() => void) | null;
  private _autoCloseHandle: MutationObserver | null;
  constructor() {
  this.downloadManager = new DownloadManager();
  this.courseExtractor = new CourseExtractor(); // 新增课程提取器
  this.homework = new HomeworkModule();
  this.settingsPanel = new SettingsPanel({
    title: "云邮教学空间助手",
    version: `v${VERSION}`,
    toggleTitle: "云邮助手设置",
    actionBindings: {
      "clear-deleted-homeworks-btn": {
        onClick: () => this.handleClearDeletedHomeworks(),
        getState: () => this.getClearDeletedHomeworkButtonState(),
      },
      "settings-export": {
        onClick: () => this.handleSettingsExport(),
      },
      "settings-import": {
        onClick: () => this.handleSettingsImport(),
      },
      "settings-reset": {
        onClick: () => this.handleSettingsReset(),
      },
    },
    onSave: (changes) => this.handleSettingsSaved(changes),
  });
  this.currentPage = location.href;
  this.observers = new Set();
  this.isBatchDownloading = false; // 批量下载状态
  this._injectedStyles = new Set();
  this._themeActive = false;
  this._unlockCopyBound = false;
  this._imageViewerCleanup = null;
  this._courseExtractorRetryTimer = null;
  this._notificationMarkReadHandler = null;
  this._notificationObserver = null;
  this._simplifyStylesInjected = false;
  this._homeSimplifyCleanup = null;
  this._autoCloseHandle = null;
  }

  init() {
    Settings.init();
    this.applyDownloadConcurrency();
    this.loadStyles();
    this.createUI();
    this.registerMenuCommands();

    this.handleCurrentPage();
    this.setupPageChangeListener();
  }

  loadStyles() {
    const injectStyle = (key, css) => {
    if (!css || this._injectedStyles.has(key)) return;
    GM_addStyle(css);
    this._injectedStyles.add(key);
    };

    const nprogressCSS = GM_getResourceText('NPROGRESS_CSS');
    if (typeof nprogressCSS === 'string' && nprogressCSS.length) {
    injectStyle('nprogress', nprogressCSS);
    } else {
    LOG.error('Failed to load NProgress styles; skipping injection.');
    }

    const enableNewView = Settings.get('home', 'enableNewView');
    const showHomeworkSource = Settings.get('homework', 'showHomeworkSource');

    if (showHomeworkSource || enableNewView) {
    injectStyle('homework-badges', `
    .course-info-badge {
    display: inline-block;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
    color: #57606a;
    background-color: #f1f2f4;
    border-radius: 12px;
    margin-bottom: 5px;
    max-width: fit-content;
    }

    .course-info-badge-detail {
    display: inline-block;
    padding: 2px 8px;
    font-size: 13px;
    font-weight: 500;
    color: #444;
    background-color: #f0f2f5;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    transform: translateY(-5px);
    }

    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item {
    height: auto !important;
    padding-bottom: 12px !important;
    }

    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item .activity-box > div:first-child {
    flex-direction: column !important;
    justify-content: center !important;
    height: 100% !important;
    }

    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item .activity-box .activity-title {
    height: auto !important;
    white-space: normal !important;
    }
    `);
    }

    injectStyle('notification-toast', `
    .uep-notification {
    position: fixed;
    bottom: 80px;
    right: 20px;
    color: #fff;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
    max-width: 300px;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
    pointer-events: none;
    }

    .uep-notification.is-visible {
    opacity: 1;
    transform: translateY(0);
    }

    .uep-notification__title {
    font-weight: 600;
    margin-bottom: 5px;
    }

    .uep-notification__message {
    font-size: 14px;
    }

    .uep-notification--success { background: #4CAF50; }
    .uep-notification--error { background: #f56c6c; }
    .uep-notification--info { background: #409EFF; }
    .uep-notification--warn { background: #E6A23C; }
    `);

    injectStyle('image-lightbox', `
    .uep-image-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    opacity: 0;
    transition: opacity .2s ease;
    cursor: zoom-out;
    }

    .uep-image-lightbox.is-visible {
    opacity: 1;
    }

    .uep-image-lightbox img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    background: #111;
    }
    `);

    if (enableNewView) {
    injectStyle('enhanced-course-cards', `
    .enhanced-course-item {
    height: auto;
    padding: 16px;
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    margin: 0;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    border: 1px solid #ebeef5;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    }

    .enhanced-course-item:hover {
    background-color: #f9fafc;
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    transform: translateY(-2px);
    }

    .enhanced-course-item__icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    font-weight: bold;
    font-size: 18px;
    }

    .enhanced-course-item__color-strip {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 4px;
    width: 100%;
    }

    .enhanced-course-item .my-lesson-name {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
    margin-bottom: 8px;
    line-height: 1.4;
    }

    .enhanced-course-item .my-lesson-teachers {
    font-size: 13px;
    color: #606266;
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    }

    .enhanced-course-item .my-lesson-area {
    font-size: 13px;
    color: #909399;
    margin-top: 8px;
    display: flex;
    align-items: flex-start;
    }

    .enhanced-course-item .my-lesson-area__icon {
    flex: 0 0 auto;
    display: flex;
    }

    .enhanced-course-item .my-lesson-area__text {
    flex: 1 1 auto;
    white-space: normal;
    line-height: 1.5;
    word-break: break-word;
    }
    `);
    }

    if (Settings.get('notification', 'betterNotificationHighlight')) {
    injectStyle('notification-highlight', `
    /* 通知高亮样式 */
    .notification-with-dot {
      background-color: #fff8f8 !important;
      border-left: 5px solid #f56c6c !important;
      box-shadow: 0 2px 6px rgba(245, 108, 108, 0.2) !important;
      padding: 0 22px !important;
      margin-bottom: 8px !important;
      border-radius: 4px !important;
      transition: all 0.3s ease !important;
    }
    .notification-with-dot:hover {
      background-color: #fff0f0 !important;
      box-shadow: 0 4px 12px rgba(245, 108, 108, 0.3) !important;
      transform: translateY(-2px) !important;
    }
    /* 隐藏高亮通知中的小红点 */
    .notification-with-dot .el-badge__content.is-dot {
      display: none !important;
    }
    `);
    }

    if (Settings.get('system', 'unlockCopy')) {
    injectStyle('unlock-copy', `
    .el-checkbox, .el-checkbox-button__inner, .el-empty__image img, .el-radio,
    div, span, p, a, h1, h2, h3, h4, h5, h6, li, td, th {
      -webkit-user-select: auto !important;
      -moz-user-select: auto !important;
      -ms-user-select: auto !important;
      user-select: auto !important;
    }
    `);
    if (!this._unlockCopyBound) {
    document.addEventListener('copy', e => e.stopImmediatePropagation(), true);
    document.addEventListener('selectstart', e => e.stopImmediatePropagation(), true);
    this._unlockCopyBound = true;
    }
    }

    if (enableNewView) {
    injectStyle('modern-theme', `
    body.uep-theme {
    --uep-font-sans: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Hiragino Sans GB', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
    --uep-bg: #f6f8fb;
    --uep-surface: #ffffff;
    --uep-text: #303133;
    --uep-muted: #606266;
    --uep-border: #ebeef5;
    --uep-primary: #409EFF;
    --uep-radius-sm: 6px;
    --uep-radius-md: 8px;
    --uep-radius-lg: 12px;
    --uep-shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
    --uep-shadow-md: 0 6px 16px rgba(0,0,0,0.08);
    --uep-shadow-lg: 0 12px 24px rgba(0,0,0,0.12);
    font-family: var(--uep-font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: var(--uep-text);
    background-color: var(--uep-bg);
    }

    body.uep-theme .el-card,
    body.uep-theme .el-dialog,
    body.uep-theme .el-message-box,
    body.uep-theme .el-popover,
    body.uep-theme .el-dropdown-menu,
    body.uep-theme .el-tooltip__popper,
    body.uep-theme .el-select-dropdown {
    border-radius: var(--uep-radius-lg) !important;
    border-color: var(--uep-border) !important;
    box-shadow: var(--uep-shadow-md) !important;
    background-color: var(--uep-surface) !important;
    color: var(--uep-text) !important;
    }

    body.uep-theme .el-input__inner,
    body.uep-theme .el-textarea__inner,
    body.uep-theme input.el-input__inner,
    body.uep-theme textarea.el-textarea__inner {
    border-radius: var(--uep-radius-md) !important;
    border-color: var(--uep-border) !important;
    background-color: var(--uep-surface) !important;
    color: var(--uep-text) !important;
    transition: box-shadow .2s ease, border-color .2s ease;
    }

    body.uep-theme .el-input.is-active .el-input__inner,
    body.uep-theme .el-input__inner:focus,
    body.uep-theme .el-textarea__inner:focus {
    border-color: var(--uep-primary) !important;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--uep-primary) 20%, transparent) !important;
    outline: none !important;
    }

    body.uep-theme .el-button,
    body.uep-theme .unified-homework-actions .trash-bin-info,
    body.uep-theme #yzHelper-settings button {
    border-radius: var(--uep-radius-md) !important;
    }

    body.uep-theme .el-button--primary,
    body.uep-theme #yzHelper-settings .action-btn.secondary,
    body.uep-theme #yzHelper-settings-toggle {
    background-color: var(--uep-primary) !important;
    border-color: var(--uep-primary) !important;
    color: #fff !important;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--uep-primary) 20%, transparent) !important;
    }

    body.uep-theme .el-button--primary:hover,
    body.uep-theme #yzHelper-settings .action-btn.secondary:hover,
    body.uep-theme #yzHelper-settings-toggle:hover {
    filter: brightness(0.95);
    }

    body.uep-theme .el-tag,
    body.uep-theme .course-info-badge,
    body.uep-theme .course-info-badge-detail,
    body.uep-theme .homework-status-badge,
    body.uep-theme .trash-bin-info,
    body.uep-theme .homework-count {
    border-radius: var(--uep-radius-sm) !important;
    border-color: var(--uep-border) !important;
    }

    body.uep-theme .unified-homework-container {
    border-radius: var(--uep-radius-lg) !important;
    box-shadow: var(--uep-shadow-md) !important;
    }

    body.uep-theme .unified-homework-card {
    border-radius: var(--uep-radius-md) !important;
    box-shadow: var(--uep-shadow-sm) !important;
    }

    body.uep-theme #yzHelper-settings,
    body.uep-theme #yzHelper-settings-content,
    body.uep-theme #yzHelper-header,
    body.uep-theme #yzHelper-settings .setting-description {
    background: var(--uep-surface) !important;
    color: var(--uep-text) !important;
    border-color: var(--uep-border) !important;
    }

    body.uep-theme #yzHelper-settings-sidebar {
    background: color-mix(in srgb, var(--uep-surface) 95%, #0000) !important;
    }

    body.uep-theme #yzHelper-settings-sidebar .menu-item.active {
    background: var(--uep-primary) !important;
    }

    body.uep-theme *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
    }

    body.uep-theme *::-webkit-scrollbar-track {
    background: transparent;
    }

    body.uep-theme *::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--uep-primary) 30%, #0000);
    border-radius: 10px;
    }

    body.uep-theme *::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--uep-primary) 45%, #0000);
    }
    `);
    }
  }

  setThemeActive(active) {
    const body = document.body;
    if (!body) return;
    if (active) {
    if (!this._themeActive) {
    body.classList.add('uep-theme');
    this._themeActive = true;
    }
    return;
    }
    if (this._themeActive) {
    body.classList.remove('uep-theme');
    this._themeActive = false;
    }
  }

  setupPageChangeListener() {
    const historyAny = history as History & { __UEP_locationPatched?: boolean };
    const windowAny = window as Window &
      typeof globalThis & { __UEP_dispatchersPatched?: boolean };
    let currentUrl = location.href;
    const onChange = () => {
    if (location.href !== currentUrl) {
    currentUrl = location.href;
    this.currentPage = location.href;
    this.handleCurrentPage();
    }
    };
    // Prefer event listeners over polling
    // Patch history to emit a custom event on SPA navigations (idempotent)
    try {
    if (!historyAny.__UEP_locationPatched) {
    const pushState = history.pushState;
    history.pushState = function(...args) {
      const ret = pushState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };
    const replaceState = history.replaceState;
    history.replaceState = function(...args) {
      const ret = replaceState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };
    Object.defineProperty(historyAny, '__UEP_locationPatched', { value: true, configurable: false });
    }
    } catch (e) { /* ignore */ }

    if (!windowAny.__UEP_dispatchersPatched) {
    window.addEventListener('hashchange', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    try { Object.defineProperty(windowAny, '__UEP_dispatchersPatched', { value: true, configurable: false }); } catch (_) {}
    }
    window.addEventListener('locationchange', onChange);
    // 移除频繁的轮询，依赖上面的事件钩子
  }

  async handleCurrentPage() {
    const url = this.currentPage;
    UEP_LOG('处理当前页面:', url);

    try {
    // 清理上一页的观察者、定时器等
    this.destroy();

    // Office预览重定向
    if (url.startsWith(CONSTANTS.URLS.office)) {
    await this.handleOfficeRedirect();
    return;
    }

    // 课件预览页面
    if (url.startsWith(CONSTANTS.URLS.resourceLearn)) {
    this.handleResourcePreview();
    return;
    }

    // 作业详情页面
    if (url.startsWith(CONSTANTS.URLS.assignmentDetails)) {
    await this.handleAssignmentDetails();
    return;
    }

    // 主页面
    if (url.startsWith(CONSTANTS.URLS.home) || url.startsWith(CONSTANTS.URLS.homeFallback)) {
    await this.handleHomePage();
    await this.handleCoursesPage();
    return;
    }

    // 课程主页
    if (url.startsWith(CONSTANTS.URLS.courseHome)) {
    await this.handleCourseHome();
    return;
    }



    // 通知页面
    if (isNotificationRoute(url)) {
    this.handleNotificationPage();
    return;
    }

    // 学生课程页面 - 新增处理课程列表页面
    if (isCourseRoute(url) && !isNotificationRoute(url)) {
    await this.handleCoursesPage();
    return;
    }
    } catch (error) {
    LOG.error('Handle page error:', error);
    }
  }

  async handleOfficeRedirect() {
    const urlParams = new URLSearchParams(location.search);
    const fileUrl = urlParams.get('furl');
    const filename = urlParams.get('fullfilename') || fileUrl;

    if (!fileUrl || !filename) return;

    const viewURL = new URL(fileUrl);
    const oauthKey = urlParams.get('oauthKey');
    if (oauthKey) {
    const viewURLsearch = new URLSearchParams(viewURL.search);
    viewURLsearch.set('oauthKey', oauthKey);
    viewURL.search = viewURLsearch.toString();
    }

    // Office文件重定向
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.office)) {
    if (!Settings.get('preview', 'autoSwitchOffice')) return;
    if (window.stop) window.stop();
    location.href = CONSTANTS.OFFICE_PREVIEW_BASE + encodeURIComponent(viewURL.toString());
    return;
    }

    // PDF文件重定向
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.pdf)) {
    if (!Settings.get('preview', 'autoSwitchPdf')) return;
    if (window.stop) window.stop();
    try {
    const response = await fetch(viewURL.toString());
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    location.href = blobUrl;
    } catch (err) {
    LOG.error('PDF加载失败:', err);
    }
    return;
    }

    // 图片文件重定向
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.image)) {
    if (!Settings.get('preview', 'autoSwitchImg')) return;
    if (window.stop) window.stop();
    this.createImageViewer(viewURL.toString());
    return;
    }
  }

  handleResourcePreview() {
    if (Settings.get('system', 'betterTitle')) {
    const filename = this.extractFilenameFromPreviewUrl(location.href);
    document.title = `[预览] ${filename || '课件'} - 教学云空间`;
    }

    if (Settings.get('preview', 'autoClosePopup')) {
    this.autoClosePreviewPopup();
    }

    if (Settings.get('preview', 'hideTimer')) {
    GM_addStyle('.preview-container .time { display: none !important; }');
    }
  }

  async handleAssignmentDetails() {
    const urlObj = new URL(location.href);
    let assignmentId = urlObj.searchParams.get('assignmentId');
    let title = urlObj.searchParams.get('assignmentTitle');

    // Hash-based SPA routes put params after '#', parse them as fallback
    if (!assignmentId || !title) {
    try {
    const hash = location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashQuery = hash.slice(qIndex + 1);
      const hs = new URLSearchParams(hashQuery);
      assignmentId = assignmentId || hs.get('assignmentId');
      title = title || hs.get('assignmentTitle');
    }
    } catch (_) { /* ignore */ }
    }

    if (Settings.get('system', 'betterTitle')) {
    document.title = `[作业] ${title} - 教学云空间`;
    }

    // 自动切换到"作业信息"标签页
    this.autoSwitchToAssignmentInfoTab();

    if (!assignmentId || !Settings.get('homework', 'showHomeworkSource')) return;

    try {
    // 检查缓存
    let courseInfo = Storage.getCourseInfo(assignmentId);
    if (!courseInfo) {
    await API.searchCourses([assignmentId]);
    courseInfo = Storage.getCourseInfo(assignmentId);
    }

    if (courseInfo) {
    this.insertCourseInfo(courseInfo);
    }

    // 处理资源预览和下载
    await this.handleAssignmentResources(assignmentId);
    } catch (error) {
    LOG.error('Handle assignment details error:', error);
    }
  }

  async handleHomePage() {
    const enableNewView = Settings.get('home', 'enableNewView');
    this.setThemeActive(enableNewView);
    if (Settings.get('system', 'betterTitle')) {
    document.title = '个人主页 - 教学云空间';
    }

    // 简化主页功能
    if (Settings.get('home', 'simplifyHomePage')) {
    await this.simplifyHomePage();
    }

    if (!enableNewView) return;

    this.homework.renderSkeleton();

    try {
    const undoneList = await API.getUndoneList() as UndoneListResponse;
    const assignments = undoneList.data?.undoneList;
    if (!assignments?.length) {
      this.homework.showError('暂无待办作业');
      return;
    }

    // 创建统一的作业显示视图
    await this.homework.render(assignments);
    this.homework.clearSkeleton();
    } catch (error) {
    LOG.error('Handle home page error:', error);
    this.homework.showError('作业数据加载失败');
    }
  }

  private getCourseHomeParams(): URLSearchParams {
    const hash = location.hash || '';
    const questionIndex = hash.indexOf('?');
    if (questionIndex !== -1) {
      const hashQuery = hash.slice(questionIndex + 1);
      try {
        return new URLSearchParams(hashQuery);
      } catch {
        LOG.debug('解析 hash 查询参数失败，将尝试使用 search');
      }
    }

    const search = location.search || '';
    if (search.startsWith('?')) {
      try {
        return new URLSearchParams(search.slice(1));
      } catch {
        LOG.debug('解析 search 查询参数失败，返回空参数');
      }
    }
    return new URLSearchParams();
  }

  private resolveStoredSiteId(): string {
    const extractIdFromPayload = (payload: unknown): string => {
      if (!payload || typeof payload !== 'object') return '';
      const record = payload as Record<string, unknown>;
      const candidate =
        record.siteId ??
        record.siteid ??
        record.id ??
        record.courseId ??
        record.courseid ??
        record.course_id ??
        record.site_id;
      if (
        candidate === undefined ||
        candidate === null ||
        (typeof candidate === 'string' && candidate.trim() === '')
      ) {
        return '';
      }
      return String(candidate).trim();
    };

    const directCandidates = [
      sessionStorage.getItem('siteId'),
      localStorage.getItem('siteId'),
    ];

    for (const candidate of directCandidates) {
      if (candidate && candidate.trim()) {
        return candidate.trim();
      }
    }

    const sources = [
      sessionStorage.getItem('site'),
      localStorage.getItem('site'),
    ];

    for (const raw of sources) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const id = extractIdFromPayload(parsed);
        if (id) return id;
      } catch {
        // ignore JSON parse errors
      }
    }

    return '';
  }

  async handleCourseHome(): Promise<void> {
    await handleCourseHomeFlow({
      getCourseHomeParams: () => this.getCourseHomeParams(),
      resolveStoredSiteId: () => this.resolveStoredSiteId(),
      getCourseResourceContext: () => this.createCourseResourceContext(),
      logDownloadResources: (resources) => this.logCourseResourceFetch(resources),
    });
  }

  private logCourseResourceFetch(resources: unknown[]): void {
    const count = Array.isArray(resources) ? resources.length : 0;
    LOG.debug("handleCourseHome: fetched course resources", { count });
  }

  private createCourseResourceContext(): CourseResourceContext {
    return {
      downloadManager: this.downloadManager,
      isBatchDownloading: () => this.isBatchDownloading,
      setBatchDownloading: (value: boolean) => {
        this.isBatchDownloading = value;
      },
      getCurrentCourseTitle: () => this.getCurrentCourseTitle(),
    };
  }

  private async simplifyHomePage(): Promise<void> {
    try {
    await Utils.wait(
      () =>
        document.querySelector('.menu-nav.el-row') &&
        document.querySelector('.home-right-container.home-inline-block'),
      5000
    );
    const body = document.body;
    if (!body) return;

    if (typeof this._homeSimplifyCleanup === 'function') {
      try {
        this._homeSimplifyCleanup();
      } catch {
        // ignore
      }
      this._homeSimplifyCleanup = null;
    }

    if (!this._simplifyStylesInjected) {
      GM_addStyle(`
      body.uep-home-simplified .menu-nav.el-row {
        display: none !important;
      }
      body.uep-home-simplified .home-right-container.home-inline-block {
        display: none !important;
      }
      body.uep-home-simplified .teacher-home-page {
        display: flex !important;
        justify-content: center !important;
      }
      body.uep-home-simplified .home-left-container.home-inline-block {
        float: none !important;
      }
    `);
      this._simplifyStylesInjected = true;
    }

    body.classList.add('uep-home-simplified');
    this._homeSimplifyCleanup = () => {
      body.classList.remove('uep-home-simplified');
    };
    LOG.debug('已通过样式方式简化主页布局。');
    } catch (error) {
    LOG.error('简化主页失败：无法应用样式。', error);
    }
  }

  // ===== 辅助方法实现 =====

  autoSwitchToAssignmentInfoTab() {
    // 等待页面和标签页加载完成
    const switchToAssignmentTab = async () => {
    try {
    // 等待标签页容器加载
    await Utils.wait(() => document.querySelector('.details-tabs'), 5000);

    // 再等待一下确保标签页完全渲染
    await Utils.sleep(500);

    // 查找"作业信息"标签
    const assignmentTab = document.querySelector('#tab-first') ||
          document.querySelector('[aria-controls="pane-first"]') ||
          document.querySelector('.el-tabs__item:first-child');

    if (assignmentTab) {
      LOG.debug('找到作业信息标签，准备点击');

      // 检查是否已经是激活状态
      if (!assignmentTab.classList.contains('is-active')) {
        LOG.debug('点击作业信息标签');
        assignmentTab.click();

        // 如果点击没有效果，尝试触发 tab 切换事件
        setTimeout(() => {
        const firstPane = document.querySelector('#pane-first');
        if (firstPane && firstPane.style.display === 'none') {
        LOG.debug('尝试手动切换标签页');
        // 手动切换标签页显示状态
        const allTabs = document.querySelectorAll('.el-tabs__item');
        const allPanes = document.querySelectorAll('.el-tab-pane');

        allTabs.forEach(tab => tab.classList.remove('is-active'));
        allPanes.forEach(pane => {
          pane.style.display = 'none';
          pane.setAttribute('aria-hidden', 'true');
        });

        assignmentTab.classList.add('is-active');
        if (firstPane) {
          firstPane.style.display = '';
          firstPane.setAttribute('aria-hidden', 'false');
        }
        }
        }, 200);
      } else {
        LOG.debug('作业信息标签已经是激活状态');
      }
    } else {
      LOG.warn('未找到作业信息标签');
    }
    } catch (error) {
    LOG.error('自动切换到作业信息标签失败:', error);
    }
    };

    // 延迟执行，确保页面完全加载
    setTimeout(switchToAssignmentTab, 1000);
  }

  extractFilenameFromPreviewUrl(url) {
    try {
    const match = url.match(/previewUrl=([^&]+)/);
    if (!match) return null;
    const previewUrl = decodeURIComponent(match[1]);
    const filenameMatch = previewUrl.match(/filename%3D([^&]+)/);
    if (!filenameMatch) return null;
    return decodeURIComponent(decodeURIComponent(filenameMatch[1]));
    } catch (e) {
    return null;
    }
  }

  autoClosePreviewPopup() {
    if (this._autoCloseHandle && typeof this._autoCloseHandle.disconnect === 'function') {
    this._autoCloseHandle.disconnect();
    this.observers.delete(this._autoCloseHandle);
    }

    const target = document.body;
    if (!target) return;

    const handledDialogs = new WeakSet();
    let rafId = null;

    const processVisibleDialog = () => {
    const wrapper = Utils.qs('div.el-message-box__wrapper');
    if (!wrapper || handledDialogs.has(wrapper)) return;

    const display = window.getComputedStyle(wrapper).display;
    if (display === 'none') return;

    const messageElement = Utils.qs('.el-message-box__message p', wrapper);
    if (!messageElement) {
    handledDialogs.add(wrapper);
    return;
    }

    const text = messageElement.textContent || '';
    if (!text.includes('您正在学习其他课件') && !text.includes('您已经在学习此课件了')) {
    handledDialogs.add(wrapper);
    return;
    }

    const confirmButton = Utils.qs('.el-button--primary', wrapper);
    if (confirmButton) {
    confirmButton.click();
    handledDialogs.add(wrapper);
    }
    };

    const scheduleCheck = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(processVisibleDialog);
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
    });

    scheduleCheck();

    const handle = {
    disconnect() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    observer.disconnect();
    }
    };

    this._autoCloseHandle = handle;
    this.observers.add(handle);
  }

  insertCourseInfo(courseInfo) {
    let inserting = false;

    const insertCourseInfoElement = async () => {
    if (inserting) return;
    inserting = true;
    try {
    const titleElement = await Utils.wait(() => {
      return Utils.$x('/html/body/div[1]/div/div[2]/div[2]/div/div/div[2]/div/div[2]/div[1]/div/div/div[1]/div/p[1]')[0]
        || document.querySelector('#assignment-info .activity-title')
        || document.querySelector('.activity-title');
    }, {
      target: document.querySelector('#assignment-info') || document.body,
      observerOptions: { childList: true, subtree: true },
      timeout: 5000
    }).catch(() => null);

    if (!titleElement) return;

    const container = titleElement.parentElement;
    if (!container || container.querySelector('.course-info-badge-detail')) return;

    const courseInfoElement = document.createElement('div');
    courseInfoElement.className = 'course-info-badge-detail';
    const courseName = (courseInfo && courseInfo.name) ? courseInfo.name : '课程信息';
    const teachersText = courseInfo && courseInfo.teachers ? `(${courseInfo.teachers})` : '';
    const courseText = Utils.escapeHtml(`${courseName}${teachersText}`);
    courseInfoElement.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style="vertical-align: -2px; margin-right: 5px; fill: currentColor;">
      <path d="M802.2 795.8H221.8c-18.5 0-33.6-15-33.6-33.6V261.8c0-18.5 15-33.6 33.6-33.6h580.4c18.5 0 33.6 15 33.6 33.6v500.4c0 18.5-15.1 33.6-33.6-33.6zM255.4 728.6h513.2V295.4H255.4v433.2z"></path>
      <path d="M864 728.6H160c-18.5 0-33.6-15-33.6-33.6V160c0-18.5 15-33.6 33.6-33.6h580.4c18.5 0 33.6 15 33.6 33.6v50.4h62c18.5 0 33.6 15 33.6 33.6v545c0 18.5-15.1 33.6-33.6 33.6zm-670.4-67.2h603.2V227.2H193.6v434.2zm670.4-134.4H830.4V295.4c0-18.5-15-33.6-33.6-33.6H227.2v-62h502.8v434.4z"></path>
      <path d="M322.6 626.2h378.8c8.4 0 15.2-6.8 15.2-15.2s-6.8-15.2-15.2-15.2H322.6c-8.4 0-15.2 6.8-15.2 15.2s6.8 15.2 15.2 15.2zM322.6 498.6h378.8c8.4 0 15.2-6.8 15.2-15.2s-6.8-15.2-15.2-15.2H322.6c-8.4 0-15.2 6.8-15.2 15.2s6.8 15.2 15.2 15.2zM322.6 371h378.8c8.4 0 15.2-6.8 15.2-15.2s-6.8-15.2-15.2-15.2H322.6c-8.4 0-15.2 6.8-15.2 15.2s6.8 15.2 15.2 15.2z"></path>
    </svg>
    <span>${courseText}</span>
    `;

    container.insertBefore(courseInfoElement, titleElement);
    } finally {
    inserting = false;
    }
    };

    void insertCourseInfoElement();

    // 设置标签页切换监听，确保切换回"作业信息"时重新插入课程信息
    this.setupTabSwitchListener(courseInfo, insertCourseInfoElement);
  }

  setupTabSwitchListener(courseInfo, insertFunction) {
    let isPageInitialized = false;

    const callInsert = () => {
    try {
    const maybe = insertFunction();
    if (maybe && typeof maybe.then === 'function') {
      maybe.catch(err => LOG.warn('插入课程信息失败:', err));
    }
    } catch (error) {
    LOG.warn('插入课程信息失败:', error);
    }
    };

    setTimeout(() => {
    isPageInitialized = true;
    LOG.debug('页面初始化完成，启用标签页监听');
    }, 2000);

    const setupTabListeners = () => {
    const assignmentInfoTab = document.querySelector('#tab-first');
    if (assignmentInfoTab && !assignmentInfoTab.hasAttribute('data-course-listener')) {
    assignmentInfoTab.setAttribute('data-course-listener', 'true');
    assignmentInfoTab.addEventListener('click', () => {
      if (!isPageInitialized) {
        LOG.debug('页面初始化中，忽略标签点击');
        return;
      }

      LOG.debug('作业信息标签被点击');
      setTimeout(() => {
        const currentActiveTab = document.querySelector('#tab-first');
        const firstPane = document.querySelector('#pane-first');

        if (currentActiveTab && currentActiveTab.classList.contains('is-active') &&
        firstPane && firstPane.style.display !== 'none') {
        const hasCourseInfo = document.querySelector('.course-info-badge-detail');
        if (!hasCourseInfo) {
        LOG.debug('重新插入课程信息');
        callInsert();
        }
        }
      }, 300);
    });
    }
    };

    setTimeout(() => {
    setupTabListeners();
    LOG.debug('标签页监听器已设置');
    }, 1000);

    const tabObserver = new MutationObserver(Utils.debounce(() => {
    if (!isPageInitialized) return;
    const assignmentInfoTab = document.querySelector(CONSTANTS.SELECTORS.assignmentInfoTab);
    const firstPane = document.querySelector(CONSTANTS.SELECTORS.assignmentInfoPane);
    if (assignmentInfoTab && assignmentInfoTab.classList.contains('is-active') && firstPane && firstPane.style.display !== 'none') {
    const hasCourseInfo = document.querySelector('.course-info-badge-detail');
    if (!hasCourseInfo) callInsert();
    setupTabListeners();
    }
    }, 150));
    const tabsRoot = document.querySelector('.details-tabs') || document.body;
    tabObserver.observe(tabsRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
    this.observers.add(tabObserver);
  }

  findAssignmentResourceElements() {
    const container = document.querySelector('#assignment-info');
    if (!container) return [];

    const preferredSelectors = [
    '.assignment-resource .resource-item',
    '.assignment-attachment__item',
    '.assignment-attachment-list .attachment-item',
    '.work-attachment .attachment-item',
    '.attachment-list .attachment-item',
    '.resource-attachment .resource-item',
    '.resource-item',
    '.file-item'
    ];

    for (const selector of preferredSelectors) {
    const nodes = Array.from(container.querySelectorAll(selector));
    if (nodes.length) return nodes;
    }

    const hostSet = new Set();
    container.querySelectorAll('i.by-icon-eye-grey, i.by-icon-yundown-grey, i.by-icon-download').forEach(icon => {
    const host = icon.closest('.attachment-item, .resource-item, .file-item, .el-row, li');
    if (host) hostSet.add(host);
    });
    if (hostSet.size) return Array.from(hostSet);

    const genericRows = Array.from(container.querySelectorAll('.el-row, li')).filter(node => {
    return node.querySelector('a, button, i.by-icon-eye-grey, i.by-icon-yundown-grey');
    });
    return genericRows;
  }

  async handleAssignmentResources(assignmentId) {
    try {
    const detail = await API.getAssignmentDetail(assignmentId);
    if (!detail?.data?.assignmentResource) return;

    const resources = detail.data.assignmentResource;
    const courseNameCandidates = [
      detail?.data?.courseName,
      detail?.data?.courseTitle,
      detail?.data?.course?.courseName,
      detail?.data?.course?.name,
      detail?.data?.courseInfo?.courseName,
      detail?.data?.courseInfo?.name,
    ];
    const courseName =
      courseNameCandidates
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .find((value) => value.length) || this.getCurrentCourseTitle();
    const previewCache = new Map();
    const resolveFilename = (res, index) => {
    return res?.resourceName
      || res?.name
      || res?.fileName
      || `附件-${index + 1}`;
    };
    const fetchPreviewInfo = (res) => {
    const resourceId = res?.resourceId || res?.id;
    if (!resourceId) {
      return Promise.reject(new Error('缺少资源ID，无法获取预览链接'));
    }
    const key = String(resourceId);
    const cached = previewCache.get(key);
    if (cached) {
      return cached instanceof Promise ? cached : Promise.resolve(cached);
    }
    const promise = Utils.withRetry(() => API.getPreviewURL(resourceId), 3, 300)
      .then(data => {
        previewCache.set(key, data);
        return data;
      })
      .catch(err => {
        previewCache.delete(key);
        throw err;
      });
    previewCache.set(key, promise);
    return promise;
    };

    const resourceNodes = await Utils.wait(() => {
    const nodes = this.findAssignmentResourceElements();
    return nodes.length ? nodes : null;
    }, {
    timeout: 8000,
    target: document.querySelector('#assignment-info') || document.body,
    observerOptions: { childList: true, subtree: true }
    }).catch(() => []);

    if (!resourceNodes.length) {
    LOG.warn('未找到作业附件节点，跳过资源增强');
    return;
    }

        const normalizeText = (text: unknown) => {
      if (!text) return '';
      return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
    };
    const labelCache = new Map<Element, string>();
    const getNodeLabel = (node: Element) => {
      if (!labelCache.has(node)) {
        labelCache.set(node, normalizeText(node.textContent));
      }
      return labelCache.get(node) ?? '';
    };

    const usedNodes = new Set<HTMLElement>();
    const pickNodeForResource = (resource: Record<string, unknown>, fallbackIndex: number, filename: string) => {
    const normalizedName = normalizeText(filename);
    if (normalizedName) {
      for (const node of resourceNodes) {
        if (usedNodes.has(node)) continue;
        const label = getNodeLabel(node);
        if (!label) continue;
        if (label.includes(normalizedName) || normalizedName.includes(label)) {
        usedNodes.add(node);
        return node;
        }
      }
    }
    for (let i = fallbackIndex; i < resourceNodes.length; i++) {
      const node = resourceNodes[i];
      if (!usedNodes.has(node)) {
        usedNodes.add(node);
        return node;
      }
    }
    for (const node of resourceNodes) {
      if (!usedNodes.has(node)) {
        usedNodes.add(node);
        return node;
      }
    }
    return null;
    };

    const describeError = (error: unknown) =>
      error instanceof Error ? error.message : String(error ?? '未知错误');

    const getPreviewInfoOrNotify = async (
      resourceItem: Record<string, unknown>,
      action: '预览' | '下载'
    ): Promise<{ previewUrl?: string; onlinePreview?: string } | null> => {
      try {
        return await fetchPreviewInfo(resourceItem);
      } catch (err) {
        LOG.error('Fetch preview info failed:', err);
        NotificationManager.show(`${action}失败`, describeError(err), 'error');
        return null;
      }
    };

    resources.forEach((resource, index) => {
    const filename = resolveFilename(resource, index);
    const downloadName = resolveCourseResourceFileName(
      filename,
      courseName,
      `附件-${index + 1}`
    );
    const targetNode = pickNodeForResource(resource, index, filename);
    if (!targetNode) return;

    const resourceId = resource?.resourceId || resource?.id;
    if (resourceId) {
      targetNode.dataset.uepResourceId = String(resourceId);
    }

    // 创建预览按钮
    const previewBtn = document.createElement('i');
    previewBtn.title = '预览';
    previewBtn.classList.add('by-icon-eye-grey');
    previewBtn.addEventListener('click', async () => {
      const previewInfo = await getPreviewInfoOrNotify(resource, '预览');
      if (!previewInfo) return;

      const finalPreviewUrl = previewInfo.previewUrl;
      const finalOnlinePreview = previewInfo.onlinePreview;
      if (!finalPreviewUrl) {
        NotificationManager.show('预览失败', '未获取到预览地址', 'error');
        return;
      }

      try {
        if (Settings.get('preview', 'autoDownload')) {
          const useGM = typeof GM_download === 'function';
          if (useGM) {
            await this.downloadManager.downloadViaGM(finalPreviewUrl, downloadName, true);
          } else {
            await this.downloadManager.downloadFile(finalPreviewUrl, downloadName);
          }
        }
      } catch (e) {
        LOG.error('Auto download on preview failed:', e);
      }
      try {
        this.openPreview(finalPreviewUrl, filename, finalOnlinePreview);
      } catch (err) {
        LOG.error('Open preview failed:', err);
        NotificationManager.show('预览失败', describeError(err), 'error');
      }
    });

    // 创建下载按钮
    const downloadBtn = document.createElement('i');
    downloadBtn.title = '下载';
    downloadBtn.classList.add('by-icon-yundown-grey');
    downloadBtn.addEventListener('click', async () => {
      const previewInfo = await getPreviewInfoOrNotify(resource, '下载');
      if (!previewInfo) return;

      const finalPreviewUrl = previewInfo.previewUrl;
      if (!finalPreviewUrl) {
        NotificationManager.show('下载失败', '未获取到下载地址', 'error');
        return;
      }

      try {
        const useGM = typeof GM_download === 'function';
        if (useGM) {
          await this.downloadManager.downloadViaGM(finalPreviewUrl, downloadName, true);
        } else {
          await this.downloadManager.downloadFile(finalPreviewUrl, downloadName);
        }
      } catch (e) {
        LOG.error('Download failed:', e);
        NotificationManager.show('下载失败', describeError(e), 'error');
      }
    });

    // 移除已存在的下载/预览图标，避免重复
    targetNode.querySelectorAll('i.by-icon-download, i.by-icon-yundown-grey, i.by-icon-eye-grey')
      .forEach(icon => icon.remove());
    targetNode.appendChild(downloadBtn);
    targetNode.appendChild(previewBtn);
    });
    } catch (error) {
    LOG.error('Handle assignment resources error:', error);
    }
  }

  // 清理所有已注册的观察者与临时资源
  destroy() {
    if (this.observers && this.observers.size) {
    this.observers.forEach(obs => {
    if (obs && typeof obs.disconnect === 'function') {
      obs.disconnect();
    }
    });
    this.observers.clear();
    this._notificationObserver = null;
    }
    if (this._courseExtractorRetryTimer) {
    clearTimeout(this._courseExtractorRetryTimer);
    this._courseExtractorRetryTimer = null;
    }
    try {
    if (this.courseExtractor && typeof this.courseExtractor.toggleOriginalContainer === 'function') {
    this.courseExtractor.toggleOriginalContainer(true);
    }
    if (this.courseExtractor?.courseContainer && this.courseExtractor.courseContainer.parentNode) {
    if (this.courseExtractor.searchInput && this.courseExtractor._courseSearchHandler) {
      try {
        this.courseExtractor.searchInput.removeEventListener('input', this.courseExtractor._courseSearchHandler);
      } catch (_) { /* ignore */ }
    }
    this.courseExtractor.courseContainer.parentNode.removeChild(this.courseExtractor.courseContainer);
    this.courseExtractor.courseContainer = null;
    this.courseExtractor.coursesContainer = null;
    this.courseExtractor.searchInput = null;
    this.courseExtractor.courseCountElement = null;
    }
    } catch (e) {
    LOG.debug('Cleanup course extractor failed:', e);
    }
    if (typeof this._imageViewerCleanup === 'function') {
    try { this._imageViewerCleanup(); } catch (e) { LOG.debug('Cleanup image viewer failed:', e); }
    this._imageViewerCleanup = null;
    }
    Utils.hideImageLightbox();
    if (this._notificationMarkReadHandler) {
    document.removeEventListener('click', this._notificationMarkReadHandler, true);
    this._notificationMarkReadHandler = null;
    }
    if (typeof this._homeSimplifyCleanup === 'function') {
    try { this._homeSimplifyCleanup(); } catch (e) { LOG.debug('Cleanup home simplify failed:', e); }
    this._homeSimplifyCleanup = null;
    }
    this.homework.destroy();
    this.setThemeActive(false);
  }

  openPreview(url, filename, onlinePreview) {
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.office)) {
    Utils.openTab(CONSTANTS.OFFICE_PREVIEW_BASE + encodeURIComponent(url));
    } else if (onlinePreview) {
    Utils.openTab(onlinePreview + encodeURIComponent(url));
    }
  }
  createImageViewer(imageUrl) {
    if (!imageUrl) return;
    if (typeof this._imageViewerCleanup === 'function') {
    try { this._imageViewerCleanup(); } catch (e) { LOG.debug('Close existing image viewer failed:', e); }
    this._imageViewerCleanup = null;
    }
    const cleanup = Utils.showImageLightbox(imageUrl, {
    onClose: () => { this._imageViewerCleanup = null; }
    });
    if (typeof cleanup === 'function') {
    this._imageViewerCleanup = () => {
    cleanup();
    this._imageViewerCleanup = null;
    };
    } else {
    // Fallback：直接在新标签中打开
    Utils.openTab(imageUrl, { active: true });
    }
  }

  createUI() {
    this.settingsPanel.initialize();
    const showToggle = Settings.get("system", "showConfigButton");
    this.settingsPanel.setToggleVisibility(showToggle);
    this.settingsPanel.refresh();
  }

  private handleSettingsSaved(changes: SettingChange[] = [], notify = true): void {
    const showToggle = Settings.get("system", "showConfigButton");
    this.settingsPanel.setToggleVisibility(showToggle);
    this.settingsPanel.refreshAction("clear-deleted-homeworks-btn");
    let shouldUpdateConcurrency = false;
    let shouldRefreshNotifications = false;
    (changes || []).forEach((change) => {
      if (!change) return;
      const { category, key } = change;
      if (category === "course" && key === "downloadConcurrency") {
        shouldUpdateConcurrency = true;
      }
      if (category === "notification" && key === "sortOrder") {
        shouldRefreshNotifications = true;
      }
    });
    if (shouldUpdateConcurrency) {
      this.applyDownloadConcurrency();
    }
    if (shouldRefreshNotifications && isNotificationRoute()) {
      this.handleNotificationPage(true);
    }
    if (notify) {
      NotificationManager.show("设置已保存", "刷新页面后生效");
    }
  }

  private handleClearDeletedHomeworks(): void {
    const deletedHomeworks = Storage.getDeletedHomeworks();
    if (deletedHomeworks.length === 0) {
      NotificationManager.show("提示", "回收站为空");
      return;
    }
    if (!confirm(`确定要清空回收站中的 ${deletedHomeworks.length} 个作业吗？此操作不可恢复！`)) {
      return;
    }
    Storage.clearDeletedHomeworks();
    this.homework.updateTrashBinSummary();
    NotificationManager.show("已清空", "回收站已清空");
    this.settingsPanel.refreshAction("clear-deleted-homeworks-btn");
  }

  private getClearDeletedHomeworkButtonState() {
    const deletedCount = Storage.getDeletedHomeworks().length;
    return {
      label: `清空作业回收站 (${deletedCount})`,
      disabled: deletedCount === 0,
    };
  }

  private async handleSettingsExport(): Promise<void> {
    try {
      const data = Settings.exportAll();
      const json = JSON.stringify(data, null, 2);
      let copied = false;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(json);
          copied = true;
        } catch (error) {
          LOG.debug("复制配置到剪贴板失败:", error);
        }
      }
      if (!copied) {
        window.prompt("以下为当前配置，可手动复制保存：", json);
      }
      NotificationManager.show(
        "导出成功",
        copied ? "配置已复制到剪贴板" : "请手动复制弹窗中的配置"
      );
    } catch (error) {
      LOG.error("导出配置失败:", error);
      NotificationManager.show(
        "导出失败",
        error instanceof Error ? error.message : String(error),
        "error"
      );
    }
  }

  private async handleSettingsImport(): Promise<void> {
    const input = window.prompt("请粘贴配置 JSON：", "");
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed.length) return;
    try {
      const parsed = JSON.parse(trimmed);
      const changes = Settings.importAll(parsed);
      if (!changes.length) {
        NotificationManager.show("提示", "未检测到需要更新的配置");
        return;
      }
      this.settingsPanel.refresh();
      this.handleSettingsSaved(changes, false);
      NotificationManager.show("导入成功", "配置已应用");
    } catch (error) {
      LOG.error("导入配置失败:", error);
      NotificationManager.show(
        "导入失败",
        error instanceof Error ? error.message : String(error),
        "error"
      );
    }
  }

  private handleSettingsReset(): void {
    if (!window.confirm("确定要恢复所有设置为默认值吗？此操作不可撤销。")) {
      return;
    }
    try {
      const changes = Settings.resetAll();
      this.settingsPanel.refresh();
      this.handleSettingsSaved(changes, false);
      NotificationManager.show("已恢复默认", "设置已恢复为默认值");
    } catch (error) {
      LOG.error("重置配置失败:", error);
      NotificationManager.show(
        "重置失败",
        error instanceof Error ? error.message : String(error),
        "error"
      );
    }
  }

  private applyDownloadConcurrency(): void {
    let concurrency = Number(Settings.get("course", "downloadConcurrency"));
    if (!Number.isFinite(concurrency)) concurrency = 1;
    concurrency = Math.max(1, Math.min(10, Math.floor(concurrency)));
    this.downloadManager.setConcurrency(concurrency);
  }

  registerMenuCommands() {
    GM_registerMenuCommand('显示/隐藏插件悬浮窗', () => {
    const current = Settings.get('system', 'showConfigButton');
    const next = !current;
    Settings.set('system', 'showConfigButton', next);
    this.settingsPanel.setToggleVisibility(next);
    if (next) {
      this.settingsPanel.refresh();
    }
    NotificationManager.show('设置已更新', '页面刷新后生效');
    });
    // 切换调试日志
    GM_registerMenuCommand('切换调试日志', () => {
    const cur = GM_getValue('DEBUG', false);
    const next = !cur;
    GM_setValue('DEBUG', next);
    setDebugFlag(next);
    NotificationManager.show('提示', next ? 'DEBUG 已开启' : 'DEBUG 已关闭');
    });
  }

  async handleCoursesPage() {
    await handleCoursesPageFlow({
      courseExtractor: this.courseExtractor,
      setThemeActive: (active: boolean) => this.setThemeActive(active),
      getRetryTimer: () => this._courseExtractorRetryTimer,
      setRetryTimer: (timer: number | null) => {
        this._courseExtractorRetryTimer = timer;
      },
    });
  }

  handleNotificationPage(forceRefresh = false) {
    handleNotificationPageFlow(
      {
        getNotificationObserver: () => this._notificationObserver,
        setNotificationObserver: (observer) => {
          this._notificationObserver = observer;
        },
        registerObserver: (observer) => {
          this.observers.add(observer);
        },
        unregisterObserver: (observer) => {
          this.observers.delete(observer);
        },
      },
      forceRefresh
    );
  }
}

  
