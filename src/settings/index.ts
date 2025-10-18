export type SettingCategory =
  | "home"
  | "preview"
  | "course"
  | "homework"
  | "notification"
  | "system";

export interface SettingActionOption {
  type: "action";
  buttonId: string;
  buttonText: string;
  buttonClass?: string;
  description?: string;
}

export type SettingValueType = "boolean" | "string" | "number" | "enum";

interface SettingBaseOption<TValue, TValueType extends SettingValueType> {
  key: string;
  label: string;
  description: string;
  category?: SettingCategory;
  valueType?: TValueType;
  default: TValue;
  version?: number;
  migrate?: (storedValue: unknown, storedVersion: number | undefined) => TValue;
}

export interface SettingToggleOption
  extends SettingBaseOption<boolean, "boolean" | undefined> {
  valueType?: "boolean";
  type?: undefined;
}

export interface SettingStringOption
  extends SettingBaseOption<string, "string"> {
  valueType: "string";
  placeholder?: string;
  maxLength?: number;
  pattern?: string;
  trim?: boolean;
}

export interface SettingNumberOption
  extends SettingBaseOption<number, "number"> {
  valueType: "number";
  min?: number;
  max?: number;
  step?: number;
}

export interface SettingEnumChoice {
  value: string;
  label: string;
  description?: string;
}

export interface SettingEnumOption
  extends SettingBaseOption<string, "enum"> {
  valueType: "enum";
  choices: SettingEnumChoice[];
}

export type SettingOption =
  | SettingActionOption
  | SettingToggleOption
  | SettingStringOption
  | SettingNumberOption
  | SettingEnumOption;

export interface SettingSection {
  id: SettingCategory;
  iconKey: SettingCategory;
  title: string;
  heading: string;
  defaultCategory: SettingCategory;
  options: SettingOption[];
}

export const SETTINGS_SECTIONS: SettingSection[] = [
  {
    id: "home",
    iconKey: "home",
    title: "个人主页",
    heading: "个人主页设置",
    defaultCategory: "home",
    options: [
      {
        key: "enableNewView",
        default: true,
        label: "开启新版视图",
        description:
          "开启新版界面视图，包含：1）统一作业视图：将所有待办作业在一个界面中统一显示，包含课程来源、截止时间、紧急程度等信息；2）课程列表显示：将本学期所有课程在一个界面中统一展示，提供搜索功能，无需翻页查看。",
      },
      {
        key: "simplifyHomePage",
        default: false,
        label: "简化主页界面",
        description:
          "隐藏顶部导航菜单和右侧访问历史面板，使界面更加简洁，专注于作业和课程内容。",
      },
      {
        key: "noConfirmDelete",
        default: false,
        label: "删除作业时不再提示",
        description:
          "删除作业时跳过确认对话框，直接移入回收站。可以提高操作效率，但需要小心操作。",
      },
      {
        key: "enableHomeworkTrash",
        default: true,
        label: "启用作业回收站",
        description: "提供作业删除回收站和恢复功能，关闭后将隐藏删除按钮。",
      },
      {
        type: "action",
        buttonId: "clear-deleted-homeworks-btn",
        buttonText: "清空作业回收站",
        buttonClass: "action-btn",
      },
    ],
  },
  {
    id: "preview",
    iconKey: "preview",
    title: "课件预览",
    heading: "课件预览设置",
    defaultCategory: "preview",
    options: [
      {
        key: "autoDownload",
        default: false,
        label: "预览课件时自动下载",
        description:
          "当打开课件预览时，自动触发下载操作，方便存储课件到本地。",
      },
      {
        key: "autoSwitchOffice",
        default: false,
        label: "使用 Office365 预览 Office 文件",
        description:
          "使用微软 Office365 在线服务预览 Office 文档，提供更好的浏览体验。",
      },
      {
        key: "autoSwitchPdf",
        default: true,
        label: "使用浏览器原生阅读器预览PDF文件",
        description:
          "使用系统（浏览器）原生的阅读器预览PDF文档，提供更好的浏览体验。",
      },
      {
        key: "autoSwitchImg",
        default: true,
        label: "使用脚本内置阅读器预览图片文件",
        description:
          "使用脚本内置的阅读器预览图片文件，提供更好的浏览体验。",
      },
      {
        key: "autoClosePopup",
        default: true,
        label: "自动关闭弹窗",
        description:
          "自动关闭预览时出现的“您已经在学习”等提示弹窗。",
      },
      {
        key: "hideTimer",
        default: true,
        label: "隐藏预览界面倒计时",
        description: "隐藏预览界面中的倒计时提示，获得无干扰的阅读体验。",
      },
    ],
  },
  {
    id: "course",
    iconKey: "course",
    title: "课程详情",
    heading: "课程详情设置",
    defaultCategory: "course",
    options: [
      {
        key: "addBatchDownload",
        default: true,
        label: "增加批量下载按钮",
        description: "增加批量下载按钮，方便一键下载课程中的所有课件。",
      },
      {
        key: "zipBatchDownload",
        default: false,
        label: "批量打包为 Zip",
        description: "将批量下载的课件打包成 Zip 文件，方便集中管理。",
      },
      {
        key: "showAllDownloadButton",
        default: false,
        label: "显示所有下载按钮",
        description:
          "使每个课件文件都有下载按钮，不允许下载的课件在启用后也可以下载。",
      },
    ],
  },
  {
    id: "homework",
    iconKey: "homework",
    title: "作业详情",
    heading: "作业详情设置",
    defaultCategory: "homework",
    options: [
      {
        key: "showHomeworkSource",
        default: true,
        label: "显示作业所属课程",
        description:
          "在作业详情页显示作业所属的课程名称，便于区分不同课程的作业。",
      },
    ],
  },
  {
    id: "notification",
    iconKey: "notification",
    title: "消息通知",
    heading: "消息通知设置",
    defaultCategory: "notification",
    options: [
      {
        key: "showMoreNotification",
        default: true,
        label: "显示更多的通知",
        description:
          "在通知列表中显示更多的历史通知，不再受限于默认显示数量。",
      },
      {
        key: "sortNotificationsByTime",
        default: true,
        label: "通知按照时间排序",
        description: "将通知按照时间先后顺序排列，更容易找到最新或最早的通知。",
      },
      {
        key: "betterNotificationHighlight",
        default: true,
        label: "优化未读通知高亮",
        description:
          "增强未读通知的视觉提示，使未读消息更加醒目，不易遗漏重要信息。",
      },
    ],
  },
  {
    id: "system",
    iconKey: "system",
    title: "系统设置",
    heading: "系统设置",
    defaultCategory: "system",
    options: [
      {
        key: "betterTitle",
        default: true,
        label: "优化页面标题",
        description: "优化浏览器标签页的标题显示，更直观地反映当前页面内容。",
      },
      {
        key: "unlockCopy",
        default: true,
        label: "解除复制限制",
        description: "解除全局的复制限制，方便摘录内容进行学习笔记。",
      },
      {
        key: "showConfigButton",
        default: true,
        label: "显示插件悬浮窗",
        description: "在网页界面显示助手配置按钮，方便随时调整设置。",
      },
    ],
  },
];

export type SettingPrimitive = boolean | string | number;

type SettingState = Record<string, Record<string, SettingPrimitive>>;

type SettingDefinitionAny = SettingDefinition<SettingPrimitive>;

interface SettingDefinition<T> {
  category: SettingCategory;
  key: string;
  type: SettingValueType;
  defaultValue: T;
  version: number;
  normalize: (value: unknown) => T;
  migrate?: (storedValue: unknown, storedVersion: number | undefined) => T;
}

class SettingsStore {
  private readonly definitions = new Map<string, SettingDefinitionAny>();
  private readonly values = new Map<string, SettingPrimitive>();
  readonly defaultsByCategory: SettingState;

  constructor(definitions: SettingDefinitionAny[]) {
    const defaults: SettingState = {};
    definitions.forEach((definition) => {
      const mapKey = this.composeKey(definition.category, definition.key);
      if (this.definitions.has(mapKey)) {
        throw new Error(`Duplicate setting definition: ${definition.category}.${definition.key}`);
      }
      this.definitions.set(mapKey, definition);
      if (!defaults[definition.category]) {
        defaults[definition.category] = {};
      }
      defaults[definition.category][definition.key] = definition.defaultValue as SettingPrimitive;
    });
    Object.keys(defaults).forEach((category) => {
      Object.freeze(defaults[category]);
    });
    this.defaultsByCategory = Object.freeze(defaults);
  }

  initialize(): void {
    this.values.clear();
    this.definitions.forEach((definition, mapKey) => {
      const raw = GM_getValue(this.storageKey(definition), undefined);
      const parsed = this.deserialize(definition, raw);
      this.values.set(mapKey, parsed);
    });
  }

  get<T extends SettingPrimitive>(category: string, key: string): T {
    const mapKey = this.composeKey(category, key);
    const definition = this.definitions.get(mapKey);
    if (!definition) {
      throw new Error(`Unknown setting: ${category}.${key}`);
    }
    if (this.values.has(mapKey)) {
      return this.values.get(mapKey) as T;
    }
    return definition.defaultValue as unknown as T;
  }

  set<T extends SettingPrimitive>(category: string, key: string, value: T): void {
    const mapKey = this.composeKey(category, key);
    const definition = this.definitions.get(mapKey);
    if (!definition) {
      throw new Error(`Unknown setting: ${category}.${key}`);
    }
    const normalized = definition.normalize(value);
    this.values.set(mapKey, normalized as SettingPrimitive);
    GM_setValue(this.storageKey(definition), {
      value: normalized,
      version: definition.version,
    });
  }

  getSnapshotByCategory(): SettingState {
    const snapshot: SettingState = {};
    this.definitions.forEach((definition) => {
      if (!snapshot[definition.category]) {
        snapshot[definition.category] = {};
      }
      const value = this.get<SettingPrimitive>(definition.category, definition.key);
      snapshot[definition.category][definition.key] = value;
    });
    return snapshot;
  }

  private composeKey(category: string, key: string): string {
    return `${category}:${key}`;
  }

  private storageKey(definition: SettingDefinitionAny): string {
    return `${definition.category}_${definition.key}`;
  }

  private deserialize<T>(definition: SettingDefinition<T>, rawValue: unknown): T {
    if (rawValue == null) {
      return definition.defaultValue;
    }

    let storedValue = rawValue;
    let storedVersion: number | undefined;
    if (typeof rawValue === "object" && rawValue !== null && "value" in (rawValue as Record<string, unknown>)) {
      const record = rawValue as Record<string, unknown>;
      storedValue = record.value;
      storedVersion = typeof record.version === "number" ? record.version : undefined;
    }

    let normalized = definition.normalize(storedValue);
    if (definition.migrate && storedVersion !== undefined && storedVersion < definition.version) {
      try {
        normalized = definition.migrate(storedValue, storedVersion);
      } catch {
        normalized = definition.defaultValue;
      }
    }
    return normalized;
  }
}

function collectSettingDefinitions(): SettingDefinitionAny[] {
  const definitions: SettingDefinitionAny[] = [];
  SETTINGS_SECTIONS.forEach((section) => {
    const defaultCategory = section.defaultCategory;
    section.options.forEach((option) => {
      if (isActionOption(option)) return;

      const category = option.category ?? defaultCategory;
      const optionType = option.valueType ?? "boolean";

      switch (optionType) {
        case "boolean": {
          const boolOption = option as SettingToggleOption;
          const defaultValue = boolOption.default;
          const normalize = (value: unknown): boolean => {
            if (typeof value === "boolean") return value;
            if (typeof value === "string") {
              const normalized = value.trim().toLowerCase();
              if (normalized === "true" || normalized === "1") return true;
              if (normalized === "false" || normalized === "0") return false;
            }
            if (typeof value === "number") return value !== 0;
            return defaultValue;
          };

          const migrate = boolOption.migrate
            ? (storedValue: unknown, storedVersion: number | undefined) => {
                try {
                  return normalize(boolOption.migrate!(storedValue, storedVersion));
                } catch {
                  return defaultValue;
                }
              }
            : undefined;

          definitions.push({
            category,
            key: boolOption.key,
            type: "boolean",
            defaultValue,
            version: boolOption.version ?? 1,
            normalize,
            migrate,
          });
          break;
        }
        case "string": {
          if (!isStringOption(option)) {
            throw new Error(`Invalid string setting configuration for ${category}.${option.key}`);
          }
          const defaultValue = option.default;
          let pattern: RegExp | null = null;
          if (option.pattern) {
            try {
              pattern = new RegExp(option.pattern);
            } catch {
              pattern = null;
            }
          }
          const maxLength =
            typeof option.maxLength === "number" && option.maxLength > 0
              ? Math.floor(option.maxLength)
              : undefined;
          const trimEnabled = option.trim !== false;
          const normalize = (value: unknown): string => {
            let result: string;
            if (typeof value === "string") {
              result = value;
            } else if (value == null) {
              result = defaultValue;
            } else {
              result = String(value);
            }
            if (trimEnabled) {
              result = result.trim();
            }
            if (maxLength !== undefined && result.length > maxLength) {
              result = result.slice(0, maxLength);
            }
            if (pattern && !pattern.test(result)) {
              return defaultValue;
            }
            return result;
          };
          const migrate = option.migrate
            ? (storedValue: unknown, storedVersion: number | undefined) => {
                try {
                  return normalize(option.migrate!(storedValue, storedVersion));
                } catch {
                  return defaultValue;
                }
              }
            : undefined;

          definitions.push({
            category,
            key: option.key,
            type: "string",
            defaultValue,
            version: option.version ?? 1,
            normalize,
            migrate,
          });
          break;
        }
        case "number": {
          if (!isNumberOption(option)) {
            throw new Error(`Invalid number setting configuration for ${category}.${option.key}`);
          }
          const defaultValue = option.default;
          const min = typeof option.min === "number" ? option.min : undefined;
          const max = typeof option.max === "number" ? option.max : undefined;
          const step = typeof option.step === "number" && option.step > 0 ? option.step : undefined;

          const normalize = (value: unknown): number => {
            let num: number;
            if (typeof value === "number" && Number.isFinite(value)) {
              num = value;
            } else if (typeof value === "string" && value.trim() !== "") {
              num = Number(value);
            } else {
              num = defaultValue;
            }
            if (!Number.isFinite(num)) {
              num = defaultValue;
            }
            if (min !== undefined && num < min) {
              num = min;
            }
            if (max !== undefined && num > max) {
              num = max;
            }
            if (step !== undefined && step > 0) {
              const precision = Math.max(0, (step.toString().split(".")[1]?.length ?? 0));
              num = Math.round(num / step) * step;
              if (precision > 0) {
                num = Number(num.toFixed(precision));
              }
            }
            return num;
          };

          const migrate = option.migrate
            ? (storedValue: unknown, storedVersion: number | undefined) => {
                try {
                  return normalize(option.migrate!(storedValue, storedVersion));
                } catch {
                  return defaultValue;
                }
              }
            : undefined;

          definitions.push({
            category,
            key: option.key,
            type: "number",
            defaultValue,
            version: option.version ?? 1,
            normalize,
            migrate,
          });
          break;
        }
        case "enum": {
          if (!isEnumOption(option)) {
            throw new Error(`Invalid enum setting configuration for ${category}.${option.key}`);
          }
          const defaultValue = option.default;
          const allowedValues = new Set(option.choices.map((choice) => choice.value));
          if (!allowedValues.has(defaultValue)) {
            throw new Error(
              `Default value "${defaultValue}" not found in choices for ${category}.${option.key}`
            );
          }
          const normalize = (value: unknown): string => {
            if (typeof value === "string" && allowedValues.has(value)) {
              return value;
            }
            if (value != null) {
              const coerced = String(value);
              if (allowedValues.has(coerced)) {
                return coerced;
              }
            }
            return defaultValue;
          };
          const migrate = option.migrate
            ? (storedValue: unknown, storedVersion: number | undefined) => {
                try {
                  return normalize(option.migrate!(storedValue, storedVersion));
                } catch {
                  return defaultValue;
                }
              }
            : undefined;

          definitions.push({
            category,
            key: option.key,
            type: "enum",
            defaultValue,
            version: option.version ?? 1,
            normalize,
            migrate,
          });
          break;
        }
        default:
          throw new Error(
            `Unsupported setting type "${String(optionType)}" for ${category}.${option.key}`
          );
      }
    });
  });
  return definitions;
}

const SETTINGS_DEFINITIONS = collectSettingDefinitions();
const SETTINGS_STORE = new SettingsStore(SETTINGS_DEFINITIONS);

export class Settings {
  static readonly defaults: SettingState = SETTINGS_STORE.defaultsByCategory;
  static current: SettingState = {};

  static init(): void {
    SETTINGS_STORE.initialize();
    this.current = SETTINGS_STORE.getSnapshotByCategory();
  }

  static get<T extends SettingPrimitive = boolean>(category: string, key: string): T {
    return SETTINGS_STORE.get<T>(category, key);
  }

  static set<T extends SettingPrimitive>(category: string, key: string, value: T): void {
    SETTINGS_STORE.set(category, key, value);
    if (!this.current[category]) {
      this.current[category] = {};
    }
    this.current[category][key] = SETTINGS_STORE.get<SettingPrimitive>(category, key);
  }
}

function isActionOption(option: SettingOption): option is SettingActionOption {
  return (option as SettingActionOption).type === "action";
}

function isStringOption(option: SettingOption): option is SettingStringOption {
  return (option as SettingStringOption).valueType === "string";
}

function isNumberOption(option: SettingOption): option is SettingNumberOption {
  return (option as SettingNumberOption).valueType === "number";
}

function isEnumOption(option: SettingOption): option is SettingEnumOption {
  return (option as SettingEnumOption).valueType === "enum";
}
