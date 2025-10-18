import { SVG_ICONS } from "../../constants";
import { LOG } from "../../core/logger";
import {
  SettingActionOption,
  SettingOption,
  SettingSection,
  SettingToggleOption,
  SETTINGS_SECTIONS,
  Settings,
} from "../../settings";

const PANEL_ID = "yzHelper-settings";
const TOGGLE_ID = "yzHelper-settings-toggle";
const SIDEBAR_ID = "yzHelper-settings-sidebar";
const CONTENT_ID = "yzHelper-settings-content";
const HEADER_ID = "yzHelper-header";
const MAIN_ID = "yzHelper-main";
const CANCEL_ID = "cancelSettings";
const SAVE_ID = "saveSettings";

const PANEL_STYLES = `
${"#" + PANEL_ID} {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  border-radius: 12px;
  z-index: 9999;
  width: 500px;
  height: 450px;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  transition: all 0.3s ease;
  opacity: 0;
  transform: translateY(10px);
  color: #333;
  overflow: hidden;
  display: none;
  flex-direction: column;
}

${"#" + PANEL_ID}.visible {
  opacity: 1;
  transform: translateY(0);
}

${"#" + HEADER_ID} {
  padding: 15px 20px;
  border-bottom: 1px solid #ebeef5;
  background: #fff;
  color: #303133;
  font-weight: bold;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: none;
}

${"#" + MAIN_ID} {
  display: flex;
  flex: 1;
  overflow: hidden;
}

${"#" + SIDEBAR_ID} {
  width: 140px;
  background: #f5f7fa;
  padding: 15px 0;
  border-right: 1px solid #ebeef5;
  overflow-y: auto;
  overflow-x: hidden;
}

${"#" + SIDEBAR_ID} .menu-item {
  padding: 12px 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 6px 0 0 6px;
  margin: 2px 0;
}

${"#" + SIDEBAR_ID} .menu-item:hover {
  background: #e3f0fd;
  color: #409EFF;
  transform: none;
}

${"#" + SIDEBAR_ID} .menu-item.active {
  background: #409EFF;
  color: #fff;
  font-weight: 500;
  box-shadow: none;
}

${"#" + SIDEBAR_ID} .emoji {
  font-size: 16px;
}

${"#" + CONTENT_ID} {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  position: relative;
  padding-bottom: 70px;
  background: #fff;
}

${"#" + CONTENT_ID} .settings-section {
  display: none;
}

${"#" + CONTENT_ID} .settings-section.active {
  display: block;
}

${"#" + PANEL_ID} h3 {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

${"#" + PANEL_ID} .setting-item {
  margin-bottom: 16px;
}

${"#" + PANEL_ID} .setting-toggle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

${"#" + PANEL_ID} .setting-item:last-of-type {
  margin-bottom: 20px;
}

${"#" + PANEL_ID} .switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  margin-right: 10px;
}

${"#" + PANEL_ID} .switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

${"#" + PANEL_ID} .slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #dcdfe6;
  transition: .3s;
  border-radius: 24px;
}

${"#" + PANEL_ID} .slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

${"#" + PANEL_ID} input:checked + .slider {
  background: #409EFF;
  box-shadow: none;
}

${"#" + PANEL_ID} input:focus + .slider {
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

${"#" + PANEL_ID} input:checked + .slider:before {
  transform: translateX(20px);
}

${"#" + PANEL_ID} .setting-label {
  font-size: 14px;
  cursor: pointer;
}

${"#" + PANEL_ID} .setting-description {
  display: block;
  margin-left: 54px;
  font-size: 12px;
  color: #666;
  background: #f5f7fa;
  border-left: 3px solid #409EFF;
  border-radius: 0 4px 4px 0;
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: all 0.3s ease;
  padding: 0 12px;
  box-shadow: none;
}

${"#" + PANEL_ID} .setting-description.visible {
  max-height: 100px;
  opacity: 1;
  margin-top: 8px;
  padding: 8px 12px;
}

${"#" + PANEL_ID} .buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  position: absolute;
  bottom: 0;
  right: 0;
  background: #fff;
  padding: 10px 20px;
  width: calc(100% - 40px);
  border-top: 1px solid #ebeef5;
  box-sizing: border-box;
}

${"#" + PANEL_ID} button {
  background: #409EFF;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  color: #fff;
  transition: all 0.2s ease;
  outline: none;
  font-size: 14px;
  box-shadow: none;
}

${"#" + PANEL_ID} button:hover {
  background: #3076c9;
  transform: none;
  box-shadow: none;
}

${"#" + PANEL_ID} button.cancel {
  background: #f5f7fa;
  color: #606266;
  box-shadow: none;
}

${"#" + PANEL_ID} button.cancel:hover {
  background: #e4e7ed;
  transform: none;
  box-shadow: none;
}

${"#" + PANEL_ID} .action-btn {
  background: #f56c6c;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  outline: none;
}

${"#" + PANEL_ID} .action-btn:hover {
  background: #e55353;
}

${"#" + PANEL_ID} .action-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
}

${"#" + PANEL_ID} .action-btn.secondary {
  background: #409EFF;
  margin-left: 10px;
}

${"#" + PANEL_ID} .action-btn.secondary:hover {
  background: #337ecc;
}

${"#" + TOGGLE_ID} {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #409EFF;
  color: #fff;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  cursor: pointer;
  z-index: 9998;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transition: all 0.3s ease;
}

${"#" + TOGGLE_ID}:hover {
  background: #3076c9;
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(64, 158, 255, 0.18);
}
`;

interface ActionButtonState {
  label?: string;
  disabled?: boolean;
  title?: string;
}

interface ActionBinding {
  onClick: () => void | Promise<void>;
  getState?: () => ActionButtonState | null | undefined;
  className?: string;
}

interface SettingChange {
  category: string;
  key: string;
  value: boolean;
  previous: boolean;
}

interface SettingsPanelOptions {
  title?: string;
  version?: string;
  toggleTitle?: string;
  actionBindings?: Record<string, ActionBinding>;
  onSave?: (changes: SettingChange[]) => void;
  onCancel?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
}

export class SettingsPanel {
  private readonly options: SettingsPanelOptions;
  private stylesInjected = false;
  private initialized = false;
  private isVisible = false;

  private toggleElement: HTMLDivElement | null = null;
  private panelElement: HTMLDivElement | null = null;
  private sidebarElement: HTMLDivElement | null = null;
  private contentElement: HTMLDivElement | null = null;
  private footerElement: HTMLDivElement | null = null;

  private toggleInputs = new Map<string, HTMLInputElement>();
  private actionButtons = new Map<string, HTMLButtonElement>();
  private menuItems = new Map<string, HTMLElement>();
  private sectionElements = new Map<string, HTMLElement>();
  private activeSectionId: string | null = null;

  private cancelButton: HTMLButtonElement | null = null;
  private saveButton: HTMLButtonElement | null = null;

  constructor(options: SettingsPanelOptions = {}) {
    this.options = options;
  }

  initialize(): void {
    if (this.initialized) {
      this.refresh();
      return;
    }
    this.injectStyles();
    this.ensureStructure();
    this.render();
    this.attachEventListeners();
    this.initialized = true;
  }

  render(): void {
    if (!this.panelElement || !this.sidebarElement || !this.contentElement) {
      this.ensureStructure();
    }
    this.renderSidebar();
    this.renderSections();
    this.populateToggleValues();
    this.updateActionStates();
  }

  refresh(): void {
    if (!this.initialized) return;
    this.populateToggleValues();
    this.updateActionStates();
  }

  refreshAction(actionId: string): void {
    this.updateActionStates(actionId);
  }

  setToggleVisibility(visible: boolean): void {
    if (!this.toggleElement) return;
    this.toggleElement.style.display = visible ? "" : "none";
    if (!visible) {
      this.close();
    }
  }

  private injectStyles(): void {
    if (this.stylesInjected) return;
    GM_addStyle(PANEL_STYLES);
    this.stylesInjected = true;
  }

  private ensureStructure(): void {
    const body = document.body;
    if (!body) return;

    if (!this.toggleElement) {
      this.toggleElement = document.getElementById(TOGGLE_ID) as HTMLDivElement | null;
      if (!this.toggleElement) {
        this.toggleElement = document.createElement("div");
        this.toggleElement.id = TOGGLE_ID;
        this.toggleElement.title = this.options.toggleTitle ?? "云邮助手设置";
        this.toggleElement.innerHTML = SVG_ICONS.settingsGear;
        body.appendChild(this.toggleElement);
      }
    }

    if (!this.panelElement) {
      this.panelElement = document.getElementById(PANEL_ID) as HTMLDivElement | null;
      if (!this.panelElement) {
        this.panelElement = document.createElement("div");
        this.panelElement.id = PANEL_ID;
        body.appendChild(this.panelElement);
      }
    }

    if (!this.panelElement) return;

    this.panelElement.innerHTML = "";

    const header = document.createElement("div");
    header.id = HEADER_ID;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = this.options.title ?? "云邮教学空间助手";
    header.appendChild(titleSpan);

    const versionSpan = document.createElement("span");
    versionSpan.id = "yzHelper-version";
    versionSpan.textContent = this.options.version ?? "";
    header.appendChild(versionSpan);

    const main = document.createElement("div");
    main.id = MAIN_ID;

    this.sidebarElement = document.createElement("div");
    this.sidebarElement.id = SIDEBAR_ID;
    main.appendChild(this.sidebarElement);

    this.contentElement = document.createElement("div");
    this.contentElement.id = CONTENT_ID;
    main.appendChild(this.contentElement);

    this.footerElement = document.createElement("div");
    this.footerElement.className = "buttons";

    this.cancelButton = document.createElement("button");
    this.cancelButton.id = CANCEL_ID;
    this.cancelButton.className = "cancel";
    this.cancelButton.textContent = "取消";
    this.footerElement.appendChild(this.cancelButton);

    this.saveButton = document.createElement("button");
    this.saveButton.id = SAVE_ID;
    this.saveButton.textContent = "保存设置";
    this.footerElement.appendChild(this.saveButton);

    this.panelElement.appendChild(header);
    this.panelElement.appendChild(main);
    this.panelElement.appendChild(this.footerElement);
  }

  private renderSidebar(): void {
    if (!this.sidebarElement) return;
    this.sidebarElement.innerHTML = "";
    this.menuItems.clear();

    SETTINGS_SECTIONS.forEach((section, index) => {
      const item = document.createElement("div");
      item.className = "menu-item";
      if (index === 0) item.classList.add("active");
      item.dataset.section = section.id;

      const iconHolder = document.createElement("span");
      iconHolder.className = "emoji";
      const iconMarkup = this.resolveSectionIcon(section);
      if (iconMarkup) {
        iconHolder.innerHTML = iconMarkup;
      }
      item.appendChild(iconHolder);

      const label = document.createElement("span");
      label.textContent = section.title;
      item.appendChild(label);

      this.sidebarElement!.appendChild(item);
      this.menuItems.set(section.id, item);
    });

    this.activeSectionId = SETTINGS_SECTIONS[0]?.id ?? null;
  }

  private renderSections(): void {
    if (!this.contentElement) return;
    this.contentElement.innerHTML = "";
    this.sectionElements.clear();
    this.toggleInputs.clear();
    this.actionButtons.clear();

    SETTINGS_SECTIONS.forEach((section, index) => {
      const sectionContainer = document.createElement("div");
      sectionContainer.className = "settings-section";
      if ((this.activeSectionId && this.activeSectionId === section.id) || (!this.activeSectionId && index === 0)) {
        sectionContainer.classList.add("active");
        this.activeSectionId = section.id;
      }
      sectionContainer.id = `section-${section.id}`;

      const heading = document.createElement("h3");
      heading.textContent = section.heading;
      sectionContainer.appendChild(heading);

      section.options.forEach((option) => {
        const node = this.renderOption(section, option);
        if (node) sectionContainer.appendChild(node);
      });

      this.contentElement!.appendChild(sectionContainer);
      this.sectionElements.set(section.id, sectionContainer);
    });

    if (this.footerElement) {
      this.contentElement.appendChild(this.footerElement);
    }
  }

  private renderOption(section: SettingSection, option: SettingOption): HTMLElement | null {
    if (this.isActionOption(option)) {
      return this.renderActionOption(option);
    }
    return this.renderToggleOption(section, option);
  }

  private renderToggleOption(section: SettingSection, option: SettingToggleOption): HTMLElement | null {
    const category = option.category ?? section.defaultCategory;
    const key = option.key;
    if (!category || !key) return null;

    const container = document.createElement("div");
    container.className = "setting-item";

    const toggleWrapper = document.createElement("div");
    toggleWrapper.className = "setting-toggle";

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `${category}_${key}`;
    input.dataset.category = category;
    input.dataset.key = key;
    switchLabel.appendChild(input);

    const slider = document.createElement("span");
    slider.className = "slider";
    switchLabel.appendChild(slider);

    toggleWrapper.appendChild(switchLabel);

    const label = document.createElement("span");
    label.className = "setting-label";
    label.dataset.descriptionId = `description-${category}_${key}`;
    label.textContent = option.label;
    toggleWrapper.appendChild(label);

    container.appendChild(toggleWrapper);

    if (option.description) {
      const description = document.createElement("div");
      description.className = "setting-description";
      description.id = label.dataset.descriptionId;
      description.textContent = option.description;
      container.appendChild(description);
    }

    this.toggleInputs.set(`${category}:${key}`, input);
    return container;
  }

  private renderActionOption(option: SettingActionOption): HTMLElement {
    const container = document.createElement("div");
    container.className = "setting-item";

    const wrapper = document.createElement("div");
    wrapper.className = "setting-toggle";

    const button = document.createElement("button");
    button.id = option.buttonId;
    button.dataset.actionId = option.buttonId;
    button.dataset.defaultText = option.buttonText;
    button.className = option.buttonClass ?? "action-btn";
    button.textContent = option.buttonText;
    wrapper.appendChild(button);

    container.appendChild(wrapper);

    if (option.description) {
      const description = document.createElement("div");
      description.className = "setting-description";
      description.textContent = option.description;
      container.appendChild(description);
    }

    this.actionButtons.set(option.buttonId, button);
    return container;
  }

  private attachEventListeners(): void {
    this.toggleElement?.addEventListener("click", () => this.toggleVisibility());
    this.sidebarElement?.addEventListener("click", (event) => this.handleSidebarClick(event));
    this.contentElement?.addEventListener("click", (event) => this.handleContentClick(event));
    this.cancelButton?.addEventListener("click", () => this.handleCancel());
    this.saveButton?.addEventListener("click", () => this.handleSave());
  }

  private handleSidebarClick(event: Event): void {
    const target = (event.target as HTMLElement | null)?.closest(".menu-item") as HTMLElement | null;
    if (!target || !this.sidebarElement?.contains(target)) return;

    const sectionId = target.dataset.section;
    if (!sectionId || sectionId === this.activeSectionId) return;

    if (this.activeSectionId) {
      this.menuItems.get(this.activeSectionId)?.classList.remove("active");
      this.sectionElements.get(this.activeSectionId)?.classList.remove("active");
    }

    target.classList.add("active");
    this.sectionElements.get(sectionId)?.classList.add("active");
    this.activeSectionId = sectionId;

    this.hideAllDescriptions();
  }

  private handleContentClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const label = target.closest(".setting-label") as HTMLElement | null;
    if (label) {
      event.preventDefault();
      const descriptionId = label.dataset.descriptionId;
      if (descriptionId) {
        this.toggleDescription(descriptionId);
      }
      return;
    }

    const button = target.closest("button[data-action-id]") as HTMLButtonElement | null;
    if (button) {
      event.preventDefault();
      const actionId = button.dataset.actionId;
      if (!actionId) return;
      const binding = this.options.actionBindings?.[actionId];
      if (!binding) return;

      button.disabled = true;
      Promise.resolve(binding.onClick())
        .catch((error) => {
          LOG.warn("Settings action handler failed:", error);
        })
        .finally(() => {
          this.updateActionStates(actionId);
        });
    }
  }

  private handleCancel(): void {
    this.close();
    this.options.onCancel?.();
  }

  private handleSave(): void {
    const changes: SettingChange[] = [];
    this.toggleInputs.forEach((input) => {
      const category = input.dataset.category;
      const key = input.dataset.key;
      if (!category || !key) return;
      const previous = Settings.get(category, key);
      const next = input.checked;
      if (previous !== next) {
        Settings.set(category, key, next);
        changes.push({ category, key, value: next, previous });
      }
    });

    this.close();
    this.options.onSave?.(changes);
  }

  private toggleVisibility(force?: boolean): void {
    if (force === true) {
      this.open();
      return;
    }
    if (force === false) {
      this.close();
      return;
    }
    if (this.isVisible) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    if (!this.panelElement) return;
    this.populateToggleValues();
    this.updateActionStates();
    this.panelElement.style.display = "flex";
    void this.panelElement.offsetWidth;
    this.panelElement.classList.add("visible");
    this.isVisible = true;
    this.options.onVisibilityChange?.(true);
  }

  private close(): void {
    if (!this.panelElement) return;
    this.panelElement.classList.remove("visible");
    window.setTimeout(() => {
      if (this.panelElement) {
        this.panelElement.style.display = "none";
      }
    }, 300);
    if (this.isVisible) {
      this.options.onVisibilityChange?.(false);
    }
    this.isVisible = false;
  }

  private populateToggleValues(): void {
    this.toggleInputs.forEach((input) => {
      const category = input.dataset.category;
      const key = input.dataset.key;
      if (!category || !key) return;
      input.checked = Settings.get(category, key);
    });
  }

  private updateActionStates(actionId?: string): void {
    if (!this.options.actionBindings) return;

    const updateSingle = (id: string) => {
      const button = this.actionButtons.get(id);
      const binding = this.options.actionBindings?.[id];
      if (!button || !binding) return;

      const state = binding.getState?.() ?? {};
      const label = state.label ?? button.dataset.defaultText ?? "";
      button.textContent = label;
      if (typeof state.disabled === "boolean") {
        button.disabled = state.disabled;
      } else {
        button.disabled = false;
      }
      if (state.title) {
        button.title = state.title;
      } else {
        button.removeAttribute("title");
      }
      if (binding.className) {
        button.className = binding.className;
      }
    };

    if (actionId) {
      updateSingle(actionId);
      return;
    }
    Object.keys(this.options.actionBindings).forEach(updateSingle);
  }

  private toggleDescription(descriptionId: string): void {
    if (!this.contentElement) return;
    const element = this.contentElement.querySelector<HTMLElement>(`#${CSS.escape(descriptionId)}`);
    if (!element) return;
    const isVisible = element.classList.contains("visible");
    this.hideAllDescriptions();
    if (!isVisible) {
      element.classList.add("visible");
    }
  }

  private hideAllDescriptions(): void {
    if (!this.contentElement) return;
    this.contentElement
      .querySelectorAll<HTMLElement>(".setting-description.visible")
      .forEach((desc) => desc.classList.remove("visible"));
  }

  private resolveSectionIcon(section: SettingSection): string {
    const iconKey = section.iconKey ?? section.id;
    const iconMap: Record<string, string> = {
      gear: SVG_ICONS.settingsGear,
      home: SVG_ICONS.settingsHome,
      preview: SVG_ICONS.settingsPreview,
      course: SVG_ICONS.homeworkCourse,
      homework: SVG_ICONS.homeworkTeacher,
      notification: SVG_ICONS.settingsNotification,
      system: SVG_ICONS.settingsSystem,
    };
    return iconMap[iconKey] ?? "";
  }

  private isActionOption(option: SettingOption): option is SettingActionOption {
    return (option as SettingActionOption).type === "action";
  }
}

