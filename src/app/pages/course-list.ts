import { CourseExtractor } from "../../services/course-extractor";
import { Settings } from "../../settings";
import { Utils } from "../../utils";
import { NotificationManager } from "../../services/notification-manager";
import { LOG } from "../../core/logger";
import { isCourseRoute, isNotificationRoute } from "../routing";

export interface CourseListPageContext {
  courseExtractor: CourseExtractor;
  setThemeActive(active: boolean): void;
  getRetryTimer(): number | null;
  setRetryTimer(timer: number | null): void;
}

export async function handleCoursesPage(context: CourseListPageContext): Promise<void> {
  const enableNewView = Settings.get("home", "enableNewView");
  context.setThemeActive(enableNewView);

  if (Settings.get("system", "betterTitle")) {
    document.title = "我的课程 - 教学云空间";
  }

  if (!enableNewView) {
    return;
  }

  const isReallyCoursePage = isCourseRoute();
  const isNotificationPage = isNotificationRoute();
  if (!isReallyCoursePage || isNotificationPage) {
    return;
  }

  if (!Utils.qs(".my-lesson-section") && !Utils.qs(".el-carousel__item")) {
    LOG.debug("未检测到课程页面DOM元素，跳过处理");
    return;
  }

  try {
    await Utils.wait(() => Utils.qs(".my-lesson-section"), {
      timeout: 8000,
      observerOptions: { childList: true, subtree: true },
    });
  } catch (error) {
    LOG.error("等待课程容器超时:", error);
    return;
  }

  try {
    const { courseExtractor } = context;
    const success = await courseExtractor.extractCourses();
    if (success) {
      const displaySuccess = courseExtractor.displayCourses();
      if (displaySuccess) {
        courseExtractor.toggleOriginalContainer(false);
      } else {
        LOG.error("课程显示失败");
        courseExtractor.toggleOriginalContainer(true);
      }
      return;
    }

    courseExtractor.toggleOriginalContainer(true);
    NotificationManager.show("正在加载", "首次提取失败，5秒后自动重试...", "info");

    const currentTimer = context.getRetryTimer();
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }

    const retryTimer = window.setTimeout(async () => {
      context.setRetryTimer(null);
      if (!isCourseRoute() || isNotificationRoute()) return;

      try {
        const retrySuccess = await courseExtractor.extractCourses({ force: true });
        if (retrySuccess) {
          const displaySuccess = courseExtractor.displayCourses();
          if (displaySuccess) {
            courseExtractor.toggleOriginalContainer(false);
          } else {
            courseExtractor.toggleOriginalContainer(true);
          }
        } else {
          LOG.error("多次尝试后仍无法提取课程");
          NotificationManager.show("提取失败", "无法提取课程列表，请刷新页面重试", "error");
          courseExtractor.toggleOriginalContainer(true);
        }
      } catch (retryError) {
        LOG.error("课程重试提取失败:", retryError);
        NotificationManager.show(
          "提取失败",
          "无法提取课程列表，请刷新页面重试",
          "error"
        );
        courseExtractor.toggleOriginalContainer(true);
      }
    }, 5000);

    context.setRetryTimer(retryTimer);
  } catch (error) {
    LOG.error("处理课程页面时出错:", error);
    NotificationManager.show("发生错误", "处理课程页面时出错: " + error.message, "error");
    context.courseExtractor.toggleOriginalContainer(true);
  }
}
