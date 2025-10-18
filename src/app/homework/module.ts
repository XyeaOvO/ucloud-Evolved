import { LOG, UEP_LOG } from "../../core/logger";
import { Utils } from "../../utils";
import { API, AssignmentSummary, CourseInfo } from "../../core/api";
import { Storage, DeletedHomeworkRecord } from "../../core/storage";
import { NotificationManager } from "../../services/notification-manager";
import { Settings } from "../../settings";
import { SVG_ICONS } from "../../constants";
import { isHomeworkTrashEnabled } from "../homework-utils";
import { HomeworkCardMeta, HomeworkPanelCallbacks, HomeworkPanelView } from "./panel-view";

export class HomeworkModule {
  private stylesInjected = false;
  private skeletonStylesInjected = false;
  private currentAssignments: AssignmentSummary[] = [];
  private readonly panelView: HomeworkPanelView;

  private readonly panelCallbacks: HomeworkPanelCallbacks = {
    onCardOpen: (assignmentId, meta) => this.handlePanelCardOpen(assignmentId, meta),
    onDeleteRequest: (assignmentId, meta) =>
      this.handlePanelDeleteRequest(assignmentId, meta),
    onTrashOpen: () => this.showTrashBin(),
  };

  constructor() {
    this.panelView = new HomeworkPanelView(this.panelCallbacks);
  }

  renderSkeleton(count = 4): void {
    const panel = this.mountPanel(null, count);
    if (!panel) return;

    this.addUnifiedHomeworkStyles();
    this.addHomeworkSkeletonStyles();
    this.panelView.showSkeleton(count);
  }

  clearSkeleton(): void {
    this.panelView.clearSkeleton();
  }

  showError(message: string): void {
    this.panelView.clearSkeleton();
    const panel = this.mountPanel(null, 0);
    if (!panel) return;
    const list = panel.querySelector(".unified-homework-list");
    if (list instanceof HTMLElement) {
      list.innerHTML = `<div class="homework-error">${Utils.escapeHtml(message)}</div>`;
    }
    this.panelView.setAssignmentsCount(0);
  }

  async render(assignments: AssignmentSummary[]): Promise<void> {
    const hostSection = await this.resolveHomeworkHost();
    if (!hostSection) {
      throw new Error("homework host not ready");
    }

    try {
      this.clearSkeleton();
      UEP_LOG("Complete assignments data:", assignments);
      UEP_LOG("First assignment structure:", assignments[0]);

      const filteredAssignments = assignments.filter(
        (assignment) => !Storage.isHomeworkDeleted(assignment.activityId as string)
      );
      this.currentAssignments = filteredAssignments;

      const initialCourseInfos: Record<string, CourseInfo> = {};
      filteredAssignments.forEach((assignment) => {
        const key = assignment.activityId;
        if (key === undefined || key === null || key === "") return;
        if (assignment.courseInfo && assignment.courseInfo.name) {
          initialCourseInfos[key] = assignment.courseInfo as CourseInfo;
          return;
        }
        if (assignment.siteName) {
          initialCourseInfos[key] = {
            name: assignment.siteName,
            teachers: "",
          };
        }
      });

      const assignmentsNeedingLookup = filteredAssignments.filter((assignment) => {
        const key = assignment.activityId;
        if (key === undefined || key === null || key === "") return false;
        return !initialCourseInfos[key];
      });

      let courseInfos: Record<string, CourseInfo> = { ...initialCourseInfos };
      if (assignmentsNeedingLookup.length) {
        const taskIds = Array.from(
          new Set(
            assignmentsNeedingLookup
              .map((item) => item.activityId)
              .filter((id): id is string | number => id !== undefined && id !== null && id !== "")
              .map((id) => String(id))
          )
        );
        if (taskIds.length) {
          const hints = this.buildCourseHints(assignmentsNeedingLookup);
          const fetched = await API.searchCourses(taskIds, { hints });
          if (fetched && typeof fetched === "object") {
            courseInfos = { ...fetched, ...courseInfos };
          }
        }
      }

      this.currentAssignments = filteredAssignments;

      const panel = this.mountPanel(hostSection, filteredAssignments.length);
      if (!panel) return;

      this.panelView.clearSkeleton();
      this.panelView.renderAssignments(filteredAssignments, courseInfos);
      this.panelView.updateTrashSummary(Storage.getDeletedHomeworks().length);
    } catch (error) {
      LOG.error("Create unified homework view error:", error);
      this.showError("作业数据加载失败");
    }
  }

  showTrashBin(): void {
    const deletedHomeworks = Storage.getDeletedHomeworks();

    const modal = document.createElement("div");
    modal.className = "trash-bin-modal";
    modal.innerHTML = `
    <div class="trash-bin-overlay"></div>
    <div class="trash-bin-content">
    <div class="trash-bin-header">
      <h3>作业回收站</h3>
      <div class="trash-bin-actions">
        <button class="clear-all-btn" ${deletedHomeworks.length === 0 ? "disabled" : ""}>清空回收站 (${deletedHomeworks.length})</button>
        <button class="close-trash-btn">×</button>
      </div>
    </div>
    <div class="trash-bin-body">
      ${this.generateTrashBinHTML(deletedHomeworks)}
    </div>
    </div>
    `;

    document.body.appendChild(modal);
    this.addTrashBinStyles();
    this.bindTrashBinEvents(modal, deletedHomeworks);

    setTimeout(() => {
      modal.classList.add("visible");
    }, 10);
  }

  updateTrashBinSummary(): void {
    try {
      const deletedCount = Storage.getDeletedHomeworks().length;
      this.panelView.updateTrashSummary(deletedCount);
    } catch (e) {
      LOG.warn("更新回收站状态失败:", e);
    }
  }

  destroy(): void {
    this.clearSkeleton();
    this.panelView.destroy();
    this.currentAssignments = [];
  }

  private buildCourseHints(assignments: AssignmentSummary[]): Record<string, Record<string, unknown>> {
    const hints: Record<string, Record<string, unknown>> = {};
    (assignments || []).forEach((assignment) => {
      if (!assignment || !assignment.activityId) return;
      const hint: Record<string, unknown> = {};
      const siteId =
        assignment.siteId ?? assignment.courseId ?? assignment.courseInfo?.siteId;
      if (siteId !== undefined && siteId !== null && siteId !== "") {
        hint.siteId = siteId;
      }
      const siteName =
        assignment.siteName ?? assignment.courseInfo?.name ?? assignment.courseName;
      if (siteName) hint.siteName = siteName;
      const teachers =
        assignment.courseInfo?.teachers ?? assignment.teachers ?? assignment.teacherName;
      if (teachers) hint.teachers = teachers;
      if (Object.keys(hint).length) {
        hints[assignment.activityId as string] = hint;
      }
    });
    return hints;
  }

  private mountPanel(hostSection: Element | null, assignmentCount: number): HTMLElement | null {
    const existingPanel = this.panelView.getPanel();
    if (existingPanel) {
      return existingPanel;
    }

    const targetHost =
      hostSection ||
      document.querySelector(".in-progress-section") ||
      document.querySelector(".home-left-container.home-inline-block") ||
      document.querySelector(".home-left-container");

    if (!targetHost) {
      LOG.warn("未找到作业面板的挂载位置，跳过统一作业视图渲染");
      return null;
    }

    this.addUnifiedHomeworkStyles();

    const panel = this.panelView.createPanel(assignmentCount, isHomeworkTrashEnabled());
    if (targetHost instanceof Element && targetHost.matches(".in-progress-section") && targetHost.parentNode) {
      targetHost.parentNode.replaceChild(panel, targetHost);
    } else if (targetHost instanceof HTMLElement) {
      targetHost.insertAdjacentElement("afterbegin", panel);
    } else if (targetHost.parentNode) {
      targetHost.parentNode.insertBefore(panel, targetHost);
    } else {
      document.body.appendChild(panel);
    }

    this.panelView.attach(panel);
    this.panelView.updateTrashSummary(Storage.getDeletedHomeworks().length);
    return panel;
  }

  private handlePanelCardOpen(assignmentId: string, meta: HomeworkCardMeta): void {
    LOG.debug("Card clicked:", { assignmentId, title: meta.title, type: meta.type });
    this.openAssignmentDetails(assignmentId, meta.title, meta.type);
  }

  private handlePanelDeleteRequest(assignmentId: string, meta: HomeworkCardMeta): void {
    const title = meta.title || "";
    this.confirmDeleteHomework(title, () => {
      const assignmentData = this.currentAssignments.find(
        (item) => String(item?.activityId ?? "") === String(assignmentId)
      );
      Storage.addDeletedHomework(assignmentId, assignmentData ?? null);
      this.currentAssignments = this.currentAssignments.filter(
        (item) => String(item?.activityId ?? "") !== String(assignmentId)
      );
      this.panelView.removeAssignmentCard(assignmentId);
      this.panelView.updateTrashSummary(Storage.getDeletedHomeworks().length);
      if (title) {
        NotificationManager.show("已移除", `作业"${title}"已移入回收站`);
      } else {
        NotificationManager.show("已移除", "作业已移入回收站");
      }
    });
  }

  private addUnifiedHomeworkStyles(): void {
    if (this.stylesInjected) return;
    GM_addStyle(`
    .unified-homework-container {
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    border: 1px solid #ebeef5;
    margin: 24px auto 0;
    padding: 0;
    max-width: 1200px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    }

    .unified-homework-header {
    background: #fff;
    color: #303133;
    padding: 20px 24px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #ebeef5;
    }

    .title-section {
    display: flex;
    align-items: center;
    gap: 12px;
    }

        .unified-homework-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #303133;
    letter-spacing: -0.02em;
    }

    .unified-homework-actions {
    display: flex;
    alignItems: center;
    gap: 12px;
    }

    .trash-bin-info {
    font-size: 14px;
    color: #909399;
    background-color: #f5f7fa;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s;
    user-select: none;
    }

    .trash-bin-info:hover {
    background-color: #e4e7ed;
    color: #606266;
    }

    .trash-bin-info.has-items {
    color: #67c23a;
    background-color: #f0f9ff;
    }

    .trash-bin-info.has-items:hover {
    background-color: #e1f5fe;
    color: #5ba832;
    }

    .homework-count {
    font-size: 14px;
    color: #909399;
    background-color: #f5f7fa;
    padding: 4px 10px;
    border-radius: 4px;
    }

    .homework-count,
    .trash-bin-info {
    font-weight: 500;
    letter-spacing: 0.02em;
    }

    .search-container {
    padding: 16px 24px;
    }

    .search-container input {
    width: 100%;
    padding: 10px 15px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    font-size: 14px;
    color: #606266;
    box-sizing: border-box;
    transition: all 0.3s;
    outline: none;
    }

    .search-container input:focus {
    border-color: #409EFF;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
    }

    .unified-homework-list {
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px 20px 24px;
    background: transparent;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    justify-content: center;
    }

    .unified-homework-card {
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

    .unified-homework-card:hover {
    background-color: #f9fafc;
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    transform: translateY(-2px);
    }

    .unified-homework-card.urgent {
    border-left: 4px solid #ffe6b3;
    background-color: #ffffff;
    }

    .unified-homework-card.overdue {
    border-left: 4px solid #ffd6d6;
    background-color: #ffffff;
    }

    .homework-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    }

    .homework-title {
    margin: 0 0 12px 0;
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
    line-height: 1.4;
    padding-right: 70px;
    max-width: 100%;
    }

    .homework-course,
    .homework-teacher,
    .homework-deadline {
    font-size: 13px;
    color: #606266;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
    }

    .homework-course svg,
    .homework-teacher svg,
    .homework-deadline svg {
    flex-shrink: 0;
    opacity: 0.7;
    }

    .homework-status-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
    background: #f5f7fa;
    color: #909399;
    }

    .homework-status-badge.urgent {
    background: #fff7e6;
    color: #b26a00;
    border: none;
    }

    .homework-status-badge.overdue {
    background: #fff0f0;
    color: #c0392b;
    border: none;
    }

    .homework-delete-btn {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #dcdfe6;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: all 0.3s;
    color: #909399;
    z-index: 10;
    }

    .unified-homework-card:hover .homework-delete-btn {
    opacity: 1;
    }

    .homework-delete-btn:hover {
    background: #f56c6c;
    color: white;
    border-color: #f56c6c;
    }

    .unified-homework-list::-webkit-scrollbar {
    width: 8px;
    }

    .unified-homework-list::-webkit-scrollbar-track {
    background: rgba(245, 247, 250, 0.3);
    border-radius: 10px;
    margin: 16px 0;
    }

    .unified-homework-list::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.3) 0%, rgba(64, 158, 255, 0.2) 100%);
    border-radius: 10px;
    border: 2px solid transparent;
    background-clip: content-box;
    transition: all 0.3s ease;
    }

    .unified-homework-list::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.5) 0%, rgba(64, 158, 255, 0.3) 100%);
    border-radius: 10px;
    }

    .unified-homework-list {
    scrollbar-width: thin;
    scrollbar-color: rgba(64, 158, 255, 0.3) rgba(245, 247, 250, 0.3);
    }

    @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
    }

    .unified-homework-card {
    animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    .unified-homework-card:nth-child(1) { animation-delay: 0.1s; }
    .unified-homework-card:nth-child(2) { animation-delay: 0.15s; }
    .unified-homework-card:nth-child(3) { animation-delay: 0.2s; }
    .unified-homework-card:nth-child(4) { animation-delay: 0.25s; }
    .unified-homework-card:nth-child(5) { animation-delay: 0.3s; }
    .unified-homework-card:nth-child(n+6) { animation-delay: 0.35s; }
    `);
    this.stylesInjected = true;
  }

  private addHomeworkSkeletonStyles(): void {
    if (this.skeletonStylesInjected) return;
    GM_addStyle(`
    .unified-homework-container.is-skeleton .unified-homework-actions,
    .unified-homework-container.is-skeleton .search-container {
      opacity: 0.6;
    }

    .homework-skeleton-card {
      position: relative;
      overflow: hidden;
      background: #f5f7fa;
      border: 1px solid #ebeef5;
      border-radius: 8px;
      padding: 16px;
      min-height: 110px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .homework-skeleton-line {
      height: 12px;
      border-radius: 999px;
      background: linear-gradient(90deg, #f0f1f5 25%, #e6e7ec 50%, #f0f1f5 75%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.4s ease infinite;
    }

    .homework-skeleton-line.wide {
      width: 80%;
    }

    .homework-skeleton-line.medium {
      width: 60%;
    }

    .homework-skeleton-line.short {
      width: 40%;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .homework-error {
      padding: 32px;
      text-align: center;
      color: #909399;
      font-size: 14px;
    }
    `);
    this.skeletonStylesInjected = true;
  }

  private async resolveHomeworkHost(): Promise<Element | null> {
    const selectors = [
      ".in-progress-section",
      ".home-left-container.home-inline-block",
      ".home-left-container",
    ];

    try {
      const host = await Utils.wait(() => {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) return element;
        }
        return null;
      }, {
        timeout: 7000,
        observerOptions: { childList: true, subtree: true },
        label: "homework-host",
        logTimeout: false,
      });
      if (host) return host;
    } catch (error) {
      LOG.warn("等待作业宿主容器超时，尝试使用降级容器:", error);
    }

    for (const selector of selectors) {
      const fallback = document.querySelector(selector);
      if (fallback) return fallback;
    }
    return null;
  }

  private openAssignmentDetails(assignmentId: string, title: string, type: string): void {
    LOG.debug("Opening details:", { assignmentId, title, type });

    let url: string;
    if (type === "exercise") {
      url = `https://ucloud.bupt.edu.cn/uclass/course.html#/answer?id=${assignmentId}`;
    } else {
      url = `https://ucloud.bupt.edu.cn/uclass/course.html#/student/assignmentDetails_fullpage?assignmentId=${assignmentId}&assignmentTitle=${encodeURIComponent(
        title
      )}`;
    }

    LOG.debug("Navigating to:", url);
    window.location.href = url;
  }

  private confirmDeleteHomework(title: string, callback: () => void): void {
    if (Settings.get("home", "noConfirmDelete")) {
      callback();
      return;
    }

    const modal = document.createElement("div");
    modal.className = "delete-confirm-modal";
    modal.innerHTML = `
    <div class="delete-confirm-overlay"></div>
    <div class="delete-confirm-content">
    <div class="delete-confirm-header">
      <h3>移除作业</h3>
    </div>
    <div class="delete-confirm-body">
      <p>确定要将作业"<strong>${title}</strong>"移入回收站吗？</p>
      <div class="delete-confirm-options">
        <label class="delete-confirm-checkbox">
        <input type="checkbox" id="no-confirm-checkbox">
        <span>不再提示此确认</span>
        </label>
      </div>
    </div>
    <div class="delete-confirm-actions">
      <button class="cancel-delete-btn">取消</button>
      <button class="confirm-delete-btn">移入回收站</button>
    </div>
    </div>
    `;

    document.body.appendChild(modal);
    this.addDeleteConfirmStyles();
    this.bindDeleteConfirmEvents(modal, callback);

    setTimeout(() => {
      modal.classList.add("visible");
    }, 10);
  }

  private addDeleteConfirmStyles(): void {
    if (document.getElementById("delete-confirm-styles")) return;

    const styles = document.createElement("style");
    styles.id = "delete-confirm-styles";
    styles.textContent = `
    .delete-confirm-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10001;
    opacity: 0;
    transition: opacity 0.3s ease;
    }

    .delete-confirm-modal.visible {
    opacity: 1;
    }

    .delete-confirm-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
    }

    .delete-confirm-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 400px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    }

    .delete-confirm-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid #ebeef5;
    background: #fafbfc;
    }

    .delete-confirm-header h3 {
    margin: 0;
    font-size: 18px;
    color: #303133;
    }

    .delete-confirm-body {
    padding: 20px 24px;
    background: white;
    }

    .delete-confirm-body p {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #606266;
    line-height: 1.5;
    }

    .delete-confirm-options {
    margin-top: 16px;
    }

    .delete-confirm-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #909399;
    cursor: pointer;
    user-select: none;
    }

    .delete-confirm-checkbox input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
    }

    .delete-confirm-actions {
    padding: 16px 24px 20px;
    border-top: 1px solid #ebeef5;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    background: #fafbfc;
    }

    .cancel-delete-btn, .confirm-delete-btn {
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
    outline: none;
    }

    .cancel-delete-btn {
    background: #f5f7fa;
    color: #606266;
    border: 1px solid #dcdfe6;
    }

    .cancel-delete-btn:hover {
    background: #e4e7ed;
    border-color: #c0c4cc;
    }

    .confirm-delete-btn {
    background: #f56c6c;
    color: white;
    }

    .confirm-delete-btn:hover {
    background: #e55353;
    }
    `;
    document.head.appendChild(styles);
  }

  private bindDeleteConfirmEvents(modal: HTMLElement, callback: () => void): void {
    const closeModal = () => {
      modal.classList.remove("visible");
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
    };

    modal.querySelector(".delete-confirm-overlay")?.addEventListener("click", closeModal);
    modal.querySelector(".cancel-delete-btn")?.addEventListener("click", closeModal);

    modal.querySelector(".confirm-delete-btn")?.addEventListener("click", () => {
      const noConfirmCheckbox = modal.querySelector<HTMLInputElement>("#no-confirm-checkbox");

      if (noConfirmCheckbox?.checked) {
        Settings.set("home", "noConfirmDelete", true);
        NotificationManager.show("设置已保存", "今后删除作业将不再显示确认提示");
      }

      closeModal();
      callback();
    });

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", handleKeyPress);
      }
    };
    document.addEventListener("keydown", handleKeyPress);
  }

  private generateTrashBinHTML(deletedHomeworks: DeletedHomeworkRecord[]): string {
    if (deletedHomeworks.length === 0) {
      return '<div class="empty-trash">回收站为空<br><small>删除的作业会暂时保存在这里</small></div>';
    }

    return deletedHomeworks
      .map((item) => {
        const assignment: any = item.data;
        const deletedDate = new Date(item.deletedAt).toLocaleString("zh-CN");
        const title = assignment?.title || assignment?.activityName || "未知作业";
        const isExercise = assignment?.type === 4;
        const typeLabel = isExercise ? "练习" : "作业";

        return `
    <div class="trash-item" data-assignment-id="${item.id}">
      <div class="trash-item-info">
        <h4 class="trash-item-title">${Utils.escapeHtml(title)}</h4>
        <div class="trash-item-meta">
        <span class="trash-item-type">${typeLabel}</span>
        <span class="trash-item-date">删除时间: ${deletedDate}</span>
        </div>
      </div>
      <div class="trash-item-actions">
        <button class="restore-btn" data-assignment-id="${item.id}" title="恢复">
        ${SVG_ICONS.trashRestore}
        恢复
        </button>
        <button class="permanent-delete-btn" data-assignment-id="${item.id}" title="永久删除">
        ${SVG_ICONS.trashDelete}
        </button>
      </div>
    </div>
    `;
      })
      .join("");
  }

  private addTrashBinStyles(): void {
    if (document.getElementById("trash-bin-styles")) return;

    const styles = document.createElement("style");
    styles.id = "trash-bin-styles";
    styles.textContent = `
    .trash-bin-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
    }

    .trash-bin-modal.visible {
    opacity: 1;
    }

    .trash-bin-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
    }

    .trash-bin-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 600px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    }

    .trash-bin-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid #ebeef5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fafbfc;
    }

    .trash-bin-header h3 {
    margin: 0;
    font-size: 18px;
    color: #303133;
    }

    .trash-bin-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    }

    .clear-all-btn {
    background: #f56c6c;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.3s;
    }

    .clear-all-btn:hover:not(:disabled) {
    background: #e55353;
    }

    .clear-all-btn:disabled {
    background: #c0c4cc;
    cursor: not-allowed;
    }

    .close-trash-btn {
    background: none;
    border: none;
    font-size: 24px;
    color: #909399;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.3s;
    }

    .close-trash-btn:hover {
    background: #f0f0f0;
    color: #606266;
    }

    .trash-bin-body {
    padding: 16px 24px 24px;
    overflow-y: auto;
    flex: 1;
    background: white;
    }

    .empty-trash {
    text-align: center;
    color: #909399;
    padding: 40px;
    font-size: 16px;
    }

    .trash-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    margin-bottom: 12px;
    background: #fafbfc;
    transition: all 0.3s;
    }

    .trash-item:hover {
    background: #f0f2f5;
    border-color: #c0c4cc;
    }

    .trash-item-info {
    flex: 1;
    }

    .trash-item-title {
    margin: 0 0 6px 0;
    font-size: 14px;
    font-weight: 600;
    color: #303133;
    }

    .trash-item-meta {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 12px;
    color: #909399;
    }

    .trash-item-type {
    background: #e4e7ed;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
    }

    .trash-item-actions {
    display: flex;
    gap: 8px;
    }

    .restore-btn, .permanent-delete-btn {
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.3s;
    }

    .restore-btn {
    background: #67c23a;
    color: white;
    }

    .restore-btn:hover {
    background: #5ba832;
    }

    .permanent-delete-btn {
    background: #f56c6c;
    color: white;
    }

    .permanent-delete-btn:hover {
    background: #e55353;
    }
    `;
    document.head.appendChild(styles);
  }

  private bindTrashBinEvents(modal: HTMLElement, deletedHomeworks: DeletedHomeworkRecord[]): void {
    const closeModal = () => {
      modal.classList.remove("visible");
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
    };

    modal.querySelector(".trash-bin-overlay")?.addEventListener("click", closeModal);
    modal.querySelector(".close-trash-btn")?.addEventListener("click", closeModal);

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", handleKeyPress);
      }
    };
    document.addEventListener("keydown", handleKeyPress);

    const clearAllBtn = modal.querySelector<HTMLButtonElement>(".clear-all-btn");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", () => {
        if (confirm("确定要清空回收站吗？此操作不可恢复！")) {
          Storage.clearDeletedHomeworks();
          deletedHomeworks.splice(0, deletedHomeworks.length);
          this.updateTrashBinSummary();
          NotificationManager.show("已清空", "回收站已清空");
          closeModal();
        }
      });
    }

    modal.querySelectorAll<HTMLButtonElement>(".restore-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const assignmentId = btn.getAttribute("data-assignment-id");
        const trashItem = btn.closest(".trash-item");
        const title = trashItem?.querySelector(".trash-item-title")?.textContent || "";

        const existingRecords = Storage.getDeletedHomeworks();
        const initialRecord =
          deletedHomeworks.find((i) => String(i.id) === String(assignmentId)) ??
          existingRecords.find((i) => String(i.id) === String(assignmentId));
        Storage.removeDeletedHomework(assignmentId as string);
        if (initialRecord) {
          const index = deletedHomeworks.indexOf(initialRecord);
          if (index > -1) deletedHomeworks.splice(index, 1);
        }
        trashItem?.remove();

        try {
          const record = initialRecord;
          if (record && record.data) {
            const assign = record.data as AssignmentSummary;
            let courseInfos: Record<string, CourseInfo> = {};
            try {
              courseInfos = await API.searchCourses([assign.activityId as string], {
                hints: this.buildCourseHints([assign]),
              });
            } catch (err) {
              LOG.warn("获取课程信息失败:", err);
            }
            const courseInfo = courseInfos?.[assign.activityId as string];
            this.panelView.prependAssignmentCard(assign, courseInfo);
            const assignmentKey = String(assign.activityId ?? "");
            this.currentAssignments = [
              assign,
              ...this.currentAssignments.filter((item) => String(item.activityId ?? "") !== assignmentKey),
            ];
          }
        } catch (err) {
          LOG.warn("恢复后更新统一作业面板失败:", err);
        }

        NotificationManager.show("已恢复", `作业"${title}"已恢复`);

        const remainingItems = modal.querySelectorAll(".trash-item");
        if (clearAllBtn) {
          clearAllBtn.textContent = `清空回收站 (${remainingItems.length})`;
          clearAllBtn.disabled = remainingItems.length === 0;
        }
        if (remainingItems.length === 0) {
          const body = modal.querySelector(".trash-bin-body");
          if (body) {
            body.innerHTML = '<div class="empty-trash">回收站为空<br><small>删除的作业会暂时保存在这里</small></div>';
          }
        }

        try {
          this.panelView.updateTrashSummary(Storage.getDeletedHomeworks().length);
        } catch (err) {
          LOG.warn("更新统一作业面板回收站状态失败:", err);
        }
      });
    });

    modal.querySelectorAll<HTMLButtonElement>(".permanent-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const assignmentId = btn.getAttribute("data-assignment-id");
        const trashItem = btn.closest(".trash-item");
        const title = trashItem?.querySelector(".trash-item-title")?.textContent || "";

        if (confirm(`确定要永久删除作业"${title}"吗？此操作不可恢复！`)) {
          Storage.removeDeletedHomework(assignmentId as string);
          const deletedIndex = deletedHomeworks.findIndex((i) => String(i.id) === String(assignmentId));
          if (deletedIndex > -1) deletedHomeworks.splice(deletedIndex, 1);
          trashItem?.remove();

          NotificationManager.show("已删除", `作业"${title}"已永久删除`);
          this.updateTrashBinSummary();

          const remainingItems = modal.querySelectorAll(".trash-item");
          if (clearAllBtn) {
            clearAllBtn.textContent = `清空回收站 (${remainingItems.length})`;
            clearAllBtn.disabled = remainingItems.length === 0;
          }
          if (remainingItems.length === 0) {
            const body = modal.querySelector(".trash-bin-body");
            if (body) {
              body.innerHTML = '<div class="empty-trash">回收站为空<br><small>删除的作业会暂时保存在这里</small></div>';
            }
          }
        }
      });
    });
  }
}
