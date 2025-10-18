import { CONSTANTS } from "../../constants";
import { Settings } from "../../settings";
import { Utils } from "../../utils";
import { LOG } from "../../core/logger";

export interface NotificationPageContext {
  getNotificationObserver(): MutationObserver | null;
  setNotificationObserver(observer: MutationObserver | null): void;
  registerObserver(observer: MutationObserver): void;
  unregisterObserver(observer: MutationObserver): void;
}

export async function handleNotificationPage(
  context: NotificationPageContext,
  forceRefresh = false
): Promise<void> {
  const existingObserver = context.getNotificationObserver();
  if (forceRefresh && existingObserver) {
    try {
      existingObserver.disconnect();
    } catch (error) {
      LOG.debug("重置通知观察器失败:", error);
    }
    context.unregisterObserver(existingObserver);
    context.setNotificationObserver(null);
  }

  try {
    const list = await Utils.wait(
      () => document.querySelector(CONSTANTS.SELECTORS.notificationList),
      {
        timeout: 7000,
        observerOptions: { childList: true, subtree: true },
        label: "notification-list",
        logTimeout: false,
      }
    );
    if (!(list instanceof HTMLElement)) return;

    applyNotificationListEnhancements(list);

    if (context.getNotificationObserver()) {
      return;
    }

    const observer = new MutationObserver(() => {
      observer.disconnect();
      applyNotificationListEnhancements(list);
      observer.observe(list, { childList: true, subtree: true });
    });
    observer.observe(list, { childList: true, subtree: true });
    context.setNotificationObserver(observer);
    context.registerObserver(observer);
  } catch (error) {
    LOG.debug("处理通知页面失败:", error);
  }
}

function applyNotificationListEnhancements(list: HTMLElement): void {
  if (!list) return;
  const items = Array.from(list.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  if (!items.length) return;

  const rawSortOrder = Settings.get<string>("notification", "sortOrder");
  const sortOrder = rawSortOrder === "asc" ? "asc" : "desc";
  const highlightEnabled = Settings.get("notification", "betterNotificationHighlight");

  const sorted = items.map((item, index) => {
    const timestamp = extractNotificationTimestamp(item);
    return {
      item,
      index,
      timestamp: timestamp ?? (sortOrder === "asc" ? index : -index),
    };
  });

  sorted.sort((a, b) => {
    if (a.timestamp === b.timestamp) {
      return sortOrder === "asc" ? a.index - b.index : b.index - a.index;
    }
    return sortOrder === "asc" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
  });

  sorted.forEach(({ item }) => list.appendChild(item));

  items.forEach((item) => {
    const dot = item.querySelector(CONSTANTS.SELECTORS.notificationDot);
    if (highlightEnabled) {
      item.classList.toggle("notification-with-dot", Boolean(dot));
    } else {
      item.classList.remove("notification-with-dot");
    }
  });
}

function extractNotificationTimestamp(element: HTMLElement): number | null {
  try {
    const timestampNode = element.querySelector(CONSTANTS.SELECTORS.notificationTimestamp);
    if (timestampNode && timestampNode.textContent) {
      const parsed = Utils.parseDateFlexible(timestampNode.textContent.trim());
      if (parsed) return parsed.getTime();
    }
    const dataTime =
      element.getAttribute("data-time") ||
      element.getAttribute("data-time-ms") ||
      element.getAttribute("data-timestamp");
    if (dataTime) {
      const numeric = Number(dataTime);
      if (Number.isFinite(numeric)) {
        return numeric > 1e11 ? numeric : numeric * 1000;
      }
    }
  } catch (error) {
    LOG.debug("解析通知时间失败:", error);
  }
  return null;
}
