import { API } from "../../core/api";
import { LOG } from "../../core/logger";
import { Settings } from "../../settings";
import { Utils } from "../../utils";

export interface CourseDetailContext {
  getCourseHomeParams(): URLSearchParams;
  resolveStoredSiteId(): string;
  logDownloadResources(resources: unknown[]): void;
  setupCourseResources(resources: any[]): Promise<void>;
}

export async function handleCourseHome(context: CourseDetailContext): Promise<void> {
  const params = context.getCourseHomeParams();
  let siteId = context.resolveStoredSiteId();
  let siteIdSource: "storage" | "url" = "storage";

  if (!siteId) {
    const paramCandidate =
      params.get("siteId") ??
      params.get("courseId") ??
      params.get("siteid") ??
      params.get("courseid");
    if (paramCandidate && paramCandidate.trim()) {
      siteId = paramCandidate.trim();
      siteIdSource = "url";
    }
  }

  if (!siteId) {
    LOG.warn("handleCourseHome: 未找到 siteId，跳过资源增强");
    return;
  }

  LOG.debug("handleCourseHome: resolved siteId", { siteId, source: siteIdSource });

  const courseName =
    params.get("courseName") ??
    params.get("courseTitle") ??
    params.get("name") ??
    "";

  if (Settings.get("system", "betterTitle") && courseName) {
    document.title = `[课程] ${courseName} - 教学云空间`;
  }

  try {
    await Utils.wait(
      () => Utils.qs(".resource-item") || Utils.qs(".resource-tree"),
      {
        timeout: 8000,
        observerOptions: { childList: true, subtree: true },
        label: "course-resources",
        logTimeout: false,
      }
    );
  } catch (error) {
    LOG.debug("等待课程资源节点超时，继续尝试注入下载增强:", error);
  }

  try {
    const resources = await API.getSiteResources(siteId);
    if (!Array.isArray(resources) || resources.length === 0) {
      LOG.debug("handleCourseHome: 未获取到课程资源数据", { siteId });
      return;
    }
    context.logDownloadResources(resources);
    await context.setupCourseResources(resources);
  } catch (error) {
    LOG.error("处理课程主页资源失败:", error);
  }
}
