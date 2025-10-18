import { AssignmentSummary, CourseInfo } from "../../core/api";
import { SVG_ICONS } from "../../constants";
import { Utils } from "../../utils";

export interface HomeworkCardMeta {
  title: string;
  type: string;
}

export interface HomeworkPanelCallbacks {
  onCardOpen(assignmentId: string, meta: HomeworkCardMeta): void;
  onDeleteRequest(assignmentId: string, meta: HomeworkCardMeta): void;
  onTrashOpen(): void;
}

const PANEL_ID = "unified-homework-panel";

export class HomeworkPanelView {
  private panelElement: HTMLElement | null = null;
  private listRoot: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private countLabel: HTMLElement | null = null;
  private trashButton: HTMLElement | null = null;
  private trashCountSpan: HTMLElement | null = null;
  private searchTerm = "";
  private totalAssignments = 0;
  private interactionsBound = false;
  private skeletonCleanup: (() => void) | null = null;

  constructor(private readonly callbacks: HomeworkPanelCallbacks) {}

  getPanel(): HTMLElement | null {
    if (this.panelElement && document.contains(this.panelElement)) {
      return this.panelElement;
    }
    const panel = document.getElementById(PANEL_ID);
    this.panelElement = panel instanceof HTMLElement ? panel : null;
    return this.panelElement;
  }

  createPanel(assignmentsCount: number, enableTrash: boolean): HTMLElement {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "unified-homework-container";
    panel.innerHTML = `
      <div class="unified-homework-header">
        <div class="title-section">
          ${SVG_ICONS.homeworkHeading}
          <h3 class="unified-homework-title">全部待办作业</h3>
        </div>
        <div class="unified-homework-actions">
          <div class="homework-count" id="homework-count">共 ${assignmentsCount} 项作业</div>
          ${enableTrash ? this.buildTrashButtonTemplate() : ""}
        </div>
      </div>
      <div class="search-container">
        <input type="text" id="homework-search" placeholder="搜索作业标题或课程名称..." />
      </div>
      <div class="unified-homework-list"></div>
    `;
    return panel;
  }

  attach(panel: HTMLElement): void {
    this.panelElement = panel;
    this.listRoot = panel.querySelector<HTMLElement>(".unified-homework-list");
    this.searchInput = panel.querySelector<HTMLInputElement>("#homework-search");
    this.countLabel = panel.querySelector<HTMLElement>("#homework-count");
    this.trashButton = panel.querySelector<HTMLElement>("#trash-bin-btn");
    this.trashCountSpan = panel.querySelector<HTMLElement>("#trash-count");

    if (!this.interactionsBound && this.listRoot) {
      this.listRoot.addEventListener("click", this.handleListClick);
      this.interactionsBound = true;
    }

    if (this.searchInput) {
      this.searchInput.addEventListener("input", this.handleSearchInput);
    }

    if (this.trashButton) {
      this.trashButton.addEventListener("click", this.handleTrashClick);
    }
  }

  renderAssignments(
    assignments: AssignmentSummary[],
    courseInfos: Record<string, CourseInfo>
  ): void {
    if (!this.listRoot) return;

    const fragment = document.createDocumentFragment();
    assignments.forEach((assignment, index) => {
      const courseInfo = courseInfos?.[assignment.activityId as string];
      const card = this.buildHomeworkCard(assignment, courseInfo, index);
      if (card) fragment.appendChild(card);
    });

    this.listRoot.innerHTML = "";
    this.listRoot.appendChild(fragment);
    this.totalAssignments = assignments.length;
    this.applySearchFilter();
  }

  removeAssignmentCard(assignmentId: string): void {
    if (!this.listRoot) return;
    const card = this.listRoot.querySelector<HTMLElement>(
      `.unified-homework-card[data-assignment-id="${CSS.escape(String(assignmentId))}"]`
    );
    if (card) {
      card.remove();
      this.totalAssignments = Math.max(0, this.totalAssignments - 1);
      this.applySearchFilter();
    }
  }

  prependAssignmentCard(
    assignment: AssignmentSummary,
    courseInfo: CourseInfo | undefined
  ): void {
    if (!this.listRoot) return;
    const card = this.buildHomeworkCard(assignment, courseInfo, 0);
    if (!card) return;
    this.listRoot.insertAdjacentElement("afterbegin", card);
    this.totalAssignments += 1;
    this.applySearchFilter();
  }

  updateTrashSummary(deletedCount: number): void {
    if (this.trashCountSpan) {
      this.trashCountSpan.textContent =
        deletedCount > 0 ? `回收站 (${deletedCount})` : "回收站";
    }
    if (this.trashButton) {
      this.trashButton.classList.toggle("has-items", deletedCount > 0);
    }
  }

  setAssignmentsCount(count: number): void {
    if (this.countLabel) {
      this.countLabel.textContent = `共 ${count} 项作业`;
    }
  }

  showSkeleton(count = 4): void {
    if (this.skeletonCleanup) return;
    const panel = this.getPanel();
    if (!panel || !this.listRoot) return;

    panel.classList.add("is-skeleton");
    const placeholders = Array.from({ length: count })
      .map(
        () => `
          <div class="homework-skeleton-card">
            <div class="homework-skeleton-line wide"></div>
            <div class="homework-skeleton-line medium"></div>
            <div class="homework-skeleton-line short"></div>
          </div>
        `
      )
      .join("");
    this.listRoot.innerHTML = placeholders;
    this.setAssignmentsCount(count);

    this.skeletonCleanup = () => {
      panel.classList.remove("is-skeleton");
      if (this.listRoot) {
        this.listRoot
          .querySelectorAll(".homework-skeleton-card")
          .forEach((item) => item.remove());
      }
      this.skeletonCleanup = null;
    };
  }

  clearSkeleton(): void {
    if (typeof this.skeletonCleanup === "function") {
      this.skeletonCleanup();
    }
  }

  getSearchTerm(): string {
    return this.searchTerm;
  }

  destroy(): void {
    this.clearSkeleton();

    if (this.listRoot && this.interactionsBound) {
      this.listRoot.removeEventListener("click", this.handleListClick);
    }
    this.interactionsBound = false;

    if (this.searchInput) {
      this.searchInput.removeEventListener("input", this.handleSearchInput);
    }
    if (this.trashButton) {
      this.trashButton.removeEventListener("click", this.handleTrashClick);
    }

    this.panelElement = null;
    this.listRoot = null;
    this.searchInput = null;
    this.countLabel = null;
    this.trashButton = null;
    this.trashCountSpan = null;
    this.searchTerm = "";
    this.totalAssignments = 0;
  }

  private handleListClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const deleteBtn = target.closest<HTMLButtonElement>(".homework-delete-btn");
    if (deleteBtn) {
      event.preventDefault();
      event.stopPropagation();
      const card = deleteBtn.closest<HTMLElement>(".unified-homework-card");
      const assignmentId = deleteBtn.dataset.assignmentId ?? card?.dataset.assignmentId ?? "";
      if (!assignmentId || !card) return;
      const title = card.dataset.assignmentTitle ?? "";
      const type = card.dataset.assignmentType ?? "assignment";
      this.callbacks.onDeleteRequest(assignmentId, { title, type });
      return;
    }

    const card = target.closest<HTMLElement>(".unified-homework-card");
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();

    const assignmentId = card.dataset.assignmentId ?? "";
    const title = card.dataset.assignmentTitle ?? "";
    const type = card.dataset.assignmentType ?? "assignment";

    if (assignmentId && title) {
      this.callbacks.onCardOpen(assignmentId, { title, type });
    }
  };

  private handleTrashClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    this.callbacks.onTrashOpen();
  };

  private handleSearchInput = (): void => {
    if (!this.searchInput) return;
    this.searchTerm = this.searchInput.value.trim().toLowerCase();
    this.applySearchFilter();
  };

  private applySearchFilter(): void {
    if (!this.listRoot) {
      this.setAssignmentsCount(0);
      return;
    }

    const cards = this.listRoot.querySelectorAll<HTMLElement>(".unified-homework-card");
    let visibleCount = 0;
    cards.forEach((card) => {
      const titleKey = card.dataset.searchTitle ?? "";
      const courseKey = card.dataset.searchCourse ?? "";
      const matches =
        !this.searchTerm ||
        titleKey.includes(this.searchTerm) ||
        courseKey.includes(this.searchTerm);
      card.style.display = matches ? "flex" : "none";
      if (matches) visibleCount += 1;
    });

    const count = this.searchTerm ? visibleCount : this.totalAssignments;
    this.setAssignmentsCount(count);
  }

  private buildTrashButtonTemplate(): string {
    return `
      <div class="trash-bin-info" id="trash-bin-btn" title="查看回收站">
        ${SVG_ICONS.trashCan}
        <span id="trash-count">回收站</span>
      </div>
    `;
  }

  private buildHomeworkCard(
    assignment: AssignmentSummary,
    courseInfo: CourseInfo | undefined,
    index: number
  ): HTMLElement | null {
    if (!assignment) return null;

    const isExercise = assignment.type === 4;
    const activityType = isExercise ? "exercise" : "assignment";
    const title =
      assignment.title ||
      assignment.activityName ||
      `${isExercise ? "练习" : "作业"} ${index + 1}`;
    const courseName =
      assignment.siteName ||
      (courseInfo && courseInfo.name ? courseInfo.name : "课程信息加载中...");
    const teacherName = courseInfo?.teachers || "";

    let deadlineDisplay = "无期限";
    if (assignment.endTime) {
      try {
        if (typeof assignment.endTime === "string" && assignment.endTime.includes("-")) {
          const parts = assignment.endTime.split(" ");
          if (parts.length >= 2) {
            const datePart = parts[0].split("-").slice(1).join("-");
            const timePart = parts[1].split(":").slice(0, 2).join(":");
            deadlineDisplay = `${datePart} ${timePart}`;
          } else {
            deadlineDisplay = assignment.endTime.split(" ")[0];
          }
        } else {
          const date = Utils.parseDateFlexible(assignment.endTime);
          if (date) {
            deadlineDisplay = date.toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          } else {
            deadlineDisplay = "时间格式错误";
          }
        }
      } catch {
        deadlineDisplay = "时间格式错误";
      }
    }

    let statusClass = "normal";
    let statusText = "正常";
    if (assignment.endTime) {
      try {
        const endDate = Utils.parseDateFlexible(assignment.endTime);
        if (endDate) {
          const now = new Date();
          const diff = (endDate as Date).valueOf() - now.valueOf();
          if (diff < 0) {
            statusClass = "overdue";
            statusText = "已逾期";
          } else if (diff < 72 * 60 * 60 * 1000) {
            statusClass = "urgent";
            statusText = "即将到期";
          }
        }
      } catch {
        // ignore parsing errors
      }
    }

    const typeLabel = isExercise ? "练习" : "作业";
    const card = document.createElement("div");
    card.className = `unified-homework-card ${statusClass}`;
    card.dataset.assignmentId = String(assignment.activityId ?? "");
    card.dataset.assignmentTitle = title;
    card.dataset.assignmentType = activityType;
    card.dataset.searchTitle = title.toLowerCase();
    card.dataset.searchCourse = (courseName ?? "").toLowerCase();

    const info = document.createElement("div");
    info.className = "homework-info";

    const titleElem = document.createElement("h4");
    titleElem.className = "homework-title";
    titleElem.textContent = title;
    titleElem.title = title;
    info.appendChild(titleElem);

    const courseRow = document.createElement("div");
    courseRow.className = "homework-course";
    courseRow.innerHTML = `${SVG_ICONS.homeworkCourse}<span></span>`;
    const courseSpan = courseRow.querySelector("span");
    if (courseSpan) courseSpan.textContent = courseName ?? "";
    info.appendChild(courseRow);

    if (teacherName) {
      const teacherRow = document.createElement("div");
      teacherRow.className = "homework-teacher";
      teacherRow.innerHTML = `${SVG_ICONS.homeworkTeacher}<span></span>`;
      const teacherSpan = teacherRow.querySelector("span");
      if (teacherSpan) teacherSpan.textContent = teacherName;
      info.appendChild(teacherRow);
    }

    const deadlineRow = document.createElement("div");
    deadlineRow.className = "homework-deadline";
    deadlineRow.innerHTML = `${SVG_ICONS.homeworkClock}<span></span>`;
    const deadlineSpan = deadlineRow.querySelector("span");
    if (deadlineSpan) deadlineSpan.textContent = deadlineDisplay;
    info.appendChild(deadlineRow);

    card.appendChild(info);

    const badge = document.createElement("div");
    badge.className = `homework-status-badge ${statusClass}`;
    badge.textContent = `${typeLabel} - ${statusText}`;
    card.appendChild(badge);

    if (this.trashButton) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "homework-delete-btn";
      deleteBtn.dataset.assignmentId = String(assignment.activityId ?? "");
      deleteBtn.title = "移除作业";
      deleteBtn.innerHTML = SVG_ICONS.homeworkDelete;
      card.appendChild(deleteBtn);
    }

    return card;
  }
}

